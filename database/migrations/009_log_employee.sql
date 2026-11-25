-- =====================================================================
-- Migration 009: which employee each assignment log was for
--   mysql> SOURCE D:/Niluksha_system/database/migrations/009_log_employee.sql;
-- Run ONCE, after 008.
--
-- booking_status_logs didn't record the employee, so a reassignment could
-- not be shown as "Kumari Perera -> Nimali Fernando" on the booking journey.
-- From now on every "-> assigned" log stores employee_id.
--
-- Backfill: for each booking, the LATEST "-> assigned" log gets the
-- booking's current employee_id. Older reassignments stay NULL (shown as
-- "employee not recorded"); so do bookings that were since unassigned or
-- ignored (their employee_id is already cleared).
-- =====================================================================
USE care_booking;

ALTER TABLE booking_status_logs
  ADD COLUMN employee_id INT UNSIGNED NULL AFTER user_id,
  ADD KEY idx_logs_employee (employee_id),
  ADD CONSTRAINT fk_logs_employee FOREIGN KEY (employee_id) REFERENCES employees(id);

UPDATE booking_status_logs l
JOIN (
  SELECT booking_id, MAX(id) AS last_id
  FROM booking_status_logs
  WHERE to_status = 'assigned'
  GROUP BY booking_id
) last_assign ON last_assign.last_id = l.id
JOIN bookings b ON b.id = l.booking_id
SET l.employee_id = b.employee_id
WHERE b.employee_id IS NOT NULL;

SELECT COUNT(*) AS assign_logs,
       SUM(employee_id IS NOT NULL) AS with_employee
FROM booking_status_logs
WHERE to_status = 'assigned';
