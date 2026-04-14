-- Read-only user mirrors what a replica looks like in cloud.
-- App code uses get_read_db -> this user; accidental writes via read engine
-- will fail locally just like they would against a real replica.
CREATE USER IF NOT EXISTS 'app_ro'@'%' IDENTIFIED BY 'app_ro';
GRANT SELECT ON app.* TO 'app_ro'@'%';
FLUSH PRIVILEGES;
