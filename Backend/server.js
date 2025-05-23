const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3023;

// PostgreSQL connection
const pool = new Pool({
    user: process.env.PG_USER || 'postgres',
    host: process.env.PG_HOST || 'postgres',
    database: process.env.PG_DATABASE || 'new_employee_db',
    password: process.env.PG_PASSWORD || 'admin123',
    port: process.env.PG_PORT || 5432,
});

// Create notifications table
async function createTables() {
    try {
        await pool.query(`
            drop table if exists notifications;
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                employee_id VARCHAR(7) CHECK (employee_id IS NULL OR employee_id ~ '^[ATS]{3}0(?!000)[0-9]{3}$'),
                department VARCHAR(50) CHECK (department IS NULL OR department IN ('All Departments', 'Developers', 'Testers', 'PowerBI', 'DevOps', 'HR', 'Particular Employee')),
                title VARCHAR(100) NOT NULL CHECK (title ~ '^[A-Za-z0-9.,!?-]+(?:\\s[A-Za-z0-9.,!?-]+)*$'),
                message TEXT NOT NULL CHECK (message ~ '^[A-Za-z0-9.,!?-]+(?:\\s[A-Za-z0-9.,!?-]+)*$'),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT single_target CHECK ((employee_id IS NULL) != (department IS NULL))
            );
        `);
        console.log('Notifications table created');
    } catch (error) {
        console.error('Error creating table:', error);
        process.exit(1);
    }
}

// Middleware
app.use(cors({
    origin: ['http://54.166.206.245:3023', 'http://127.0.0.1:5501'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
}));
app.use(express.json());
app.use(express.static('public'));

// Input validation middleware
const validateInput = (req, res, next) => {
    const { employeeId, department, title, message } = req.body;
    const idPattern = /^[ATS]{3}0(?!000)[0-9]{3}$/;
    const textPattern = /^[A-Za-z0-9.,!?-]+(?:\s[A-Za-z0-9.,!?-]+)*$/;
    const validDepartments = ['All Departments', 'Developers', 'Testers', 'PowerBI', 'DevOps', 'HR', 'Particular Employee'];

    if (employeeId && !idPattern.test(employeeId)) {
        console.log(`Invalid employee ID: ${employeeId}`);
        return res.status(400).json({ error: 'Invalid employee ID format (e.g., ATS0123)' });
    }
    if (department && !validDepartments.includes(department)) {
        console.log(`Invalid department: ${department}`);
        return res.status(400).json({ error: 'Invalid department' });
    }
    if (!textPattern.test(title)) {
        console.log(`Invalid title: ${title}`);
        return res.status(400).json({ error: 'Title cannot have leading/trailing spaces or consecutive spaces' });
    }
    if (!textPattern.test(message)) {
        console.log(`Invalid message: ${message}`);
        return res.status(400).json({ error: 'Message cannot have leading/trailing spaces or consecutive spaces' });
    }
    if ((employeeId && department) || (!employeeId && !department)) {
        console.log('Exactly one of employeeId or department must be provided');
        return res.status(400).json({ error: 'Provide either an employee ID or a department' });
    }
    next();
};

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'Server is running', timestamp: new Date().toISOString() });
});

// Get all departments
app.get('/api/departments', (req, res) => {
    const departments = ['All Departments', 'Developers', 'Testers', 'PowerBI', 'DevOps', 'HR', 'Particular Employee'];
    res.json(departments);
});

// Get employees by department
app.get('/api/employees/:department', async (req, res) => {
    const { department } = req.params;
    const validDepartments = ['Developers', 'Testers', 'PowerBI', 'DevOps', 'HR'];
    if (!validDepartments.includes(department)) {
        return res.status(400).json({ error: 'Invalid department' });
    }
    try {
        const result = await pool.query(
            'SELECT DISTINCT employee_id, employee_id AS name FROM notifications WHERE employee_id IS NOT NULL AND department = $1 ORDER BY employee_id',
            [department]
        );
        res.json(result.rows);
    } catch (error) {
        console.error(`Error fetching employees for department ${department}:`, error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Send notification
app.post('/api/notifications', validateInput, async (req, res) => {
    const { employeeId, department, title, message } = req.body;
    console.log(`Attempting to send notification to ${employeeId || department}`);
    try {
        const result = await pool.query(
            'INSERT INTO notifications (employee_id, department, title, message, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
            [employeeId || null, department || null, title, message]
        );
        console.log(`Notification sent successfully to ${employeeId || department}`);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error(`Error sending notification to ${employeeId || department}:`, error);
        res.status(500).json({ error: 'Server error: Unable to save notification' });
    }
});

// Get notifications for an employee
app.get('/api/notifications/:employeeId', async (req, res) => {
    const { employeeId } = req.params;
    const idPattern = /^[ATS]{3}0(?!000)[0-9]{3}$/;
    if (!idPattern.test(employeeId)) {
        console.log(`Invalid employee ID in GET request: ${employeeId}`);
        return res.status(400).json({ error: 'Invalid employee ID format' });
    }
    console.log(`Fetching notifications for employee ID: ${employeeId}`);
    try {
        // Find the employee's department from notifications where employee_id is set
        const deptResult = await pool.query(
            'SELECT DISTINCT department FROM notifications WHERE employee_id = $1 AND department IS NOT NULL LIMIT 1',
            [employeeId]
        );
        const department = deptResult.rows[0]?.department || null;

        // Fetch notifications: specific to employee_id or their department (including All Departments)
        const result = await pool.query(
            `SELECT * FROM notifications 
             WHERE employee_id = $1 
             OR department = $2 
             OR department = 'All Departments' 
             ORDER BY created_at DESC`,
            [employeeId, department]
        );
        res.json(result.rows);
    } catch (error) {
        console.error(`Error fetching notifications for employee ID: ${employeeId}`, error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Initialize server and create tables
async function startServer() {
    await createTables();
    app.listen(port, () => {
        console.log(`Server running on http://54.166.206.245:${port}`);
    });
}

startServer();