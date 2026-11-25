-- =====================================================================
-- Migration 008: index for the Reports page
--   mysql> SOURCE D:/Niluksha_system/database/migrations/008_report_index.sql;
-- Run ONCE, after 007.
--
-- The Reports page lists every booking event (status change) in a date
-- range: booking_status_logs WHERE created_at >= from AND created_at < to+1.
-- The table only had idx_logs_booking (booking_id, created_at), which can't
-- be used for that range, so this adds an index on created_at alone.
-- No data changes.
-- =====================================================================
USE care_booking;

ALTER TABLE booking_status_logs ADD KEY idx_logs_created (created_at);

SHOW INDEX FROM booking_status_logs;
