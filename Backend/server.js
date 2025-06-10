const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

console.log('Starting server setup...');

const app = express();
const port = process.env.PORT || 3601;
const host = '0.0.0.0'; // Bind to all interfaces

// Database connection pool
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
        console.log('Creating notifications table...');
        await pool.query(`
            DROP TABLE IF EXISTS notifications;
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                employee_id VARCHAR(7),
                department VARCHAR(50),
                title VARCHAR(100) NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT single_target CHECK ((employee_id IS NULL) != (department IS NULL))
            );
        `);
        console.log('Notifications table created successfully');
    } catch (error) {
        console.error('Error creating table:', error.message, error.stack);
        throw error;
    }
}

// CORS configuration
const corsOptions = {
    origin: [
        'http://127.0.0.1:5503',
        'http://localhost:5503',
        'http://3.88.203.125:3601',
        'http://3.88.203.125:7102', // HR Notification Portal
        'http://3.88.203.125:7103', // Employee Notification Portal
        'http://localhost:7102',
        'http://localhost:7103',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static('Notifications'));

// Health check endpoint
app.get('/api/health', async (req, res) => {
    console.log('Health check requested');
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({
            status: 'Server is running',
            database: 'Connected',
            databaseTime: result.rows[0].now,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Health check DB error:', error.message);
        res.status(500).json({
            status: 'Server is running',
            database: 'Disconnected',
            error: error.message,
            timestamp: new Date().toISOString(),
        });
    }
});

// Get employees by department
app.get('/api/employees/:department', async (req, res) => {
    const { department } = req.params;
    console.log(`Fetching employees for department: ${department}`);
    const validDepartments = ['Developers', 'Testers', 'PowerBI', 'DevOps', 'HR'];
    if (!validDepartments.includes(department)) {
        console.log(`Invalid department: ${department}`);
        return res.status(400).json({ error: 'Invalid department' });
    }
    try {
        const result = await pool.query(
            'SELECT DISTINCT employee_id, employee_id AS name FROM notifications WHERE employee_id IS NOT NULL AND department = $1 ORDER BY employee_id',
            [department]
        );
        console.log(`Fetched ${result.rows.length} employees`);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching employees:', error.message, error.stack);
        res.status(500).json({ error: 'Server error: Unable to fetch employees' });
    }
});

// Create notification
app.post('/api/notifications', async (req, res) => {
    const { employeeId, department, title, message } = req.body;
    console.log('Creating notification:', { employeeId, department, title });
    if (!title || !message) {
        console.log('Missing required fields');
        return res.status(400).json({ error: 'Title and message are required' });
    }
    try {
        const result = await pool.query(
            'INSERT INTO notifications (employee_id, department, title, message, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
            [employeeId || null, department || null, title, message]
        );
        console.log('Notification created:', result.rows[0]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating notification:', error.message, error.stack);
        res.status(500).json({ error: 'Server error: Unable to save notification' });
    }
});

// Get notifications for employee
app.get('/api/notifications/:employeeId', async (req, res) => {
    const { employeeId } = req.params;
    console.log(`Fetching notifications for employeeId: ${employeeId}`);
    try {
        const deptResult = await pool.query(
            'SELECT DISTINCT department FROM notifications WHERE employee_id = $1 AND department IS NOT NULL LIMIT 1',
            [employeeId]
        );
        const department = deptResult.rows[0]?.department || null;
        console.log(`Department for employee: ${department}`);

        const result = await pool.query(
            `SELECT * FROM notifications
             WHERE employee_id = $1
             OR department = $2
             OR department = 'All Departments'
             ORDER BY created_at DESC`,
            [employeeId, department]
        );
        console.log(`Fetched ${result.rows.length} notifications`);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching notifications:', error.message, error.stack);
        res.status(500).json({ error: 'Server error: Unable to fetch notifications' });
    }
});

// Start server
async function startServer() {
    try {
        console.log('Connecting to database...');
        const client = await pool.connect();
        console.log('Database connected successfully');
        client.release();
        await createTables();
        app.listen(port, host, () => {
            console.log(`Server running on http://${host}:${port} (accessible at http://3.88.203.125:${port})`);
        });
    } catch (error) {
        console.error('Error starting server:', error.message, error.stack);
        process.exit(1);
    }
}

startServer();
