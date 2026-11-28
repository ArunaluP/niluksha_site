-- =====================================================================
-- Migration 011: store every time in UTC
--   mysql> SOURCE D:/Niluksha_system/database/migrations/011_times_utc.sql;
-- Run ONCE, after 010.  (or: npm run db:migrate -- --apply)
-- Safe to run twice: it does nothing if it already ran (settings 'db_time_zone').
--
-- Why: the app saves the times it writes (confirmed, assigned, printed ...)
-- in UTC, but times MySQL filled in itself (created_at, updated_at) were in
-- Sri Lanka time, so some screens showed them 5 h 30 min off. From now on
-- the app connects with time_zone '+00:00', and this moves the old
-- MySQL-filled times back by 5 h 30 min (330 minutes).
--   created_at      -> always (MySQL filled it)
--   updated_at      -> only if never changed (= created_at); the app wrote the others in UTC
--   settings.updated_at -> always
-- Not touched: confirmed/assigned/delivered/printed/last login (already UTC),
--   export_logs and google_drive_connection (new, already UTC).
-- TAKE A BACKUP FIRST.
-- =====================================================================
USE care_booking;
SET SQL_SAFE_UPDATES = 0;
SET time_zone = '+00:00';
SET @done := (SELECT COUNT(*) FROM settings WHERE setting_key = 'db_time_zone');

START TRANSACTION;

UPDATE branches SET updated_at = IF(updated_at = created_at, updated_at - INTERVAL 330 MINUTE, updated_at),
                    created_at = created_at - INTERVAL 330 MINUTE WHERE @done = 0;
UPDATE users SET updated_at = IF(updated_at = created_at, updated_at - INTERVAL 330 MINUTE, updated_at),
                 created_at = created_at - INTERVAL 330 MINUTE WHERE @done = 0;
UPDATE employees SET updated_at = IF(updated_at = created_at, updated_at - INTERVAL 330 MINUTE, updated_at),
                     created_at = created_at - INTERVAL 330 MINUTE WHERE @done = 0;
UPDATE hospitals SET updated_at = IF(updated_at = created_at, updated_at - INTERVAL 330 MINUTE, updated_at),
                     created_at = created_at - INTERVAL 330 MINUTE WHERE @done = 0;
UPDATE customers SET updated_at = IF(updated_at = created_at, updated_at - INTERVAL 330 MINUTE, updated_at),
                     created_at = created_at - INTERVAL 330 MINUTE WHERE @done = 0;
UPDATE patients SET updated_at = IF(updated_at = created_at, updated_at - INTERVAL 330 MINUTE, updated_at),
                    created_at = created_at - INTERVAL 330 MINUTE WHERE @done = 0;
UPDATE packages SET updated_at = IF(updated_at = created_at, updated_at - INTERVAL 330 MINUTE, updated_at),
                    created_at = created_at - INTERVAL 330 MINUTE WHERE @done = 0;
UPDATE bookings SET updated_at = IF(updated_at = created_at, updated_at - INTERVAL 330 MINUTE, updated_at),
                    created_at = created_at - INTERVAL 330 MINUTE WHERE @done = 0;
UPDATE invoices SET updated_at = IF(updated_at = created_at, updated_at - INTERVAL 330 MINUTE, updated_at),
                    created_at = created_at - INTERVAL 330 MINUTE WHERE @done = 0;
UPDATE employee_leaves SET created_at = created_at - INTERVAL 330 MINUTE WHERE @done = 0;
UPDATE booking_status_logs SET created_at = created_at - INTERVAL 330 MINUTE WHERE @done = 0;
UPDATE settings SET updated_at = updated_at - INTERVAL 330 MINUTE WHERE @done = 0;

INSERT INTO settings (setting_key, value, updated_at)
SELECT 'db_time_zone', 'UTC', UTC_TIMESTAMP() FROM DUAL WHERE @done = 0;

COMMIT;
