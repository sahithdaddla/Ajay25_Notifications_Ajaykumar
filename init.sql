 CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                employee_id VARCHAR(7) CHECK (employee_id IS NULL OR employee_id ~ '^[ATS]{3}0(?!000)[0-9]{3}$'),
                department VARCHAR(50) CHECK (department IS NULL OR department IN ('All Departments', 'Developers', 'Testers', 'PowerBI', 'DevOps', 'HR', 'Particular Employee')),
                title VARCHAR(100) NOT NULL CHECK (title ~ '^[A-Za-z0-9.,!?-]+(?:\\s[A-Za-z0-9.,!?-]+)*$'),
                message TEXT NOT NULL CHECK (message ~ '^[A-Za-z0-9.,!?-]+(?:\\s[A-Za-z0-9.,!?-]+)*$'),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT single_target CHECK ((employee_id IS NULL) != (department IS NULL))
            );