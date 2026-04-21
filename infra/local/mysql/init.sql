-- Select-only user for simulation or special tools.
-- Note: Current backend architecture has been simplified to use a single DB_URL.
-- This user 'app_ro' remains available for testing or manual read-only access.
CREATE USER IF NOT EXISTS 'app_ro'@'%' IDENTIFIED BY 'app_ro';
GRANT SELECT ON app.* TO 'app_ro'@'%';
FLUSH PRIVILEGES;
