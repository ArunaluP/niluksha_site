-- =====================================================================
-- Migration 013: bookings for several days in a row
--   mysql> SOURCE D:/Niluksha_system/database/migrations/013_booking_days.sql;
-- Run ONCE, after 012.  (or: npm run db:migrate -- --apply)
--
-- days      number of days (1-30) from service_date, one caregiver for all
-- end_date  last day, worked out by MySQL (service_date + days - 1)
-- The invoice is package price x days. Existing bookings become 1 day.
-- =====================================================================
USE care_booking;

ALTER TABLE bookings
  ADD COLUMN days     TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER service_date,
  ADD COLUMN end_date DATE GENERATED ALWAYS AS (service_date + INTERVAL (days - 1) DAY) STORED AFTER days,
  ADD KEY idx_bookings_employee_range (employee_id, service_date, end_date);
