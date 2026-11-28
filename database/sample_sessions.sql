-- =====================================================================
-- Sample FINISHED sessions for the last 60 days  (TEST databases only)
--   mysql> SOURCE D:/Niluksha_system/database/sample_sessions.sql;
--
-- Needs: the latest schema (npm run db:migrate), at least one Director login,
-- some Caregiver/Nurse employees, customers with patients and an active
-- package (e.g. from database/sample_data.sql).
--
-- For every day in the last 60 days (not today) and every active Caregiver /
-- Nurse, a session is created with a different chance per employee, so the
-- Employee Report has a clear ranking. Each one goes through the whole flow,
-- with matching history:
--   booked -> confirmed -> assigned -> delivered (invoice) -> invoice printed
-- A few sessions from the last 2 days stop at "delivered" (invoice not printed
-- yet), so you can see they are NOT counted as finished.
--
-- Rules respected: one session per employee per day, never on a day the
-- employee is already booked, real BK-/INV- numbers (the counters are moved
-- on, so the next booking made in the app continues the numbering).
-- Running it again only fills days that are still free.
--
-- To remove everything this script added:
--   DELETE l FROM booking_status_logs l JOIN bookings b ON b.id = l.booking_id WHERE b.notes = 'Sample session';
--   DELETE i FROM invoices i JOIN bookings b ON b.id = i.booking_id WHERE b.notes = 'Sample session';
--   DELETE FROM bookings WHERE notes = 'Sample session';
-- =====================================================================
USE care_booking;

-- Times are stored in UTC. The plan below is worked out in Sri Lanka time
-- (@now / @today) and converted with @utc when written.
SET time_zone = '+00:00';
SET @now   := CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30');
SET @today := DATE(@now);
SET @utc   := -330; -- minutes: Sri Lanka (+05:30) -> UTC

SET @director := (SELECT id FROM users WHERE role = 'admin' AND is_active = 1 ORDER BY id LIMIT 1);
SET @caller   := COALESCE((SELECT id FROM users WHERE role = 'call_center' AND is_active = 1 ORDER BY id LIMIT 1), @director);

-- ---------- the last 60 days (1 = yesterday … 60) ----------
DROP TEMPORARY TABLE IF EXISTS tmp_days;
CREATE TEMPORARY TABLE tmp_days (day DATE PRIMARY KEY);
INSERT INTO tmp_days (day)
WITH RECURSIVE n (i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 60)
SELECT DATE_SUB(@today, INTERVAL i DAY) FROM n;

-- ---------- who can work, and how busy each one is (25 % … 79 % of days) ----------
DROP TEMPORARY TABLE IF EXISTS tmp_emps;
CREATE TEMPORARY TABLE tmp_emps AS
SELECT id, branch_id, 25 + ((id * 37) % 55) AS chance
FROM employees
WHERE status = 'active' AND designation IN ('Caregiver', 'Nurse');

-- ---------- numbered lists to pick patients / packages / hospitals from ----------
DROP TEMPORARY TABLE IF EXISTS tmp_pats;
CREATE TEMPORARY TABLE tmp_pats AS
SELECT p.id AS patient_id, p.customer_id,
       COALESCE(p.address, c.address, CONCAT('Home of ', c.full_name)) AS addr,
       ROW_NUMBER() OVER (ORDER BY p.id) AS rn
FROM patients p JOIN customers c ON c.id = p.customer_id;

DROP TEMPORARY TABLE IF EXISTS tmp_pkgs;
CREATE TEMPORARY TABLE tmp_pkgs AS
SELECT id, name, duration_hours, price, ROW_NUMBER() OVER (ORDER BY is_default DESC, id) AS rn
FROM packages WHERE is_active = 1;

DROP TEMPORARY TABLE IF EXISTS tmp_hosp;
CREATE TEMPORARY TABLE tmp_hosp AS
SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn FROM hospitals WHERE is_active = 1;

SET @np := (SELECT COUNT(*) FROM tmp_pats);
SET @nk := (SELECT COUNT(*) FROM tmp_pkgs);
SET @nh := (SELECT COUNT(*) FROM tmp_hosp);

-- ---------- which employee works which day (deterministic "random") ----------
DROP TEMPORARY TABLE IF EXISTS tmp_plan;
CREATE TEMPORARY TABLE tmp_plan AS
SELECT e.id AS employee_id, e.branch_id, d.day AS service_date, CRC32(CONCAT(e.id, '|', d.day)) AS h
FROM tmp_emps e
CROSS JOIN tmp_days d
WHERE @director IS NOT NULL AND @np > 0 AND @nk > 0
  AND CRC32(CONCAT(e.id, '|', d.day)) % 100 < e.chance
  AND NOT EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.employee_id = e.id AND d.day BETWEEN b.service_date AND b.end_date -- any day of a longer booking
      AND b.status IN ('assigned', 'delivered', 'invoice_printed')
  );

-- ---------- full details + timeline of each session ----------
DROP TEMPORARY TABLE IF EXISTS tmp_full;
CREATE TEMPORARY TABLE tmp_full AS
SELECT x.*,
       -- the last 2 days: half stop at "delivered" (not finished yet)
       IF(x.service_date >= DATE_SUB(@today, INTERVAL 2 DAY) AND x.h % 2 = 0, 'delivered', 'invoice_printed') AS final_status,
       LEAST(TIMESTAMP(x.service_date, x.start_time) + INTERVAL x.duration_hours HOUR + INTERVAL 30 MINUTE,
             CAST(@now AS DATETIME) - INTERVAL 2 HOUR) AS delivered_at
FROM (
  SELECT pl.employee_id, pl.branch_id, pl.service_date, pl.h,
         pt.patient_id, pt.customer_id, pt.addr,
         pk.id AS package_id, pk.name AS package_name, pk.duration_hours, pk.price,
         IF(pl.h % 3 = 0 AND @nh > 0, ho.id, NULL) AS hospital_id,
         CASE WHEN pk.duration_hours >= 24 OR pl.h % 2 = 0 THEN '08:00:00' ELSE '20:00:00' END AS start_time,
         -- booked 1–3 days before, during office hours
         TIMESTAMP(DATE_SUB(pl.service_date, INTERVAL 1 + pl.h % 3 DAY), MAKETIME(9 + pl.h % 8, pl.h % 60, 0)) AS created_at
  FROM tmp_plan pl
  JOIN tmp_pats pt ON pt.rn = (pl.h DIV 7) % @np + 1
  JOIN tmp_pkgs pk ON pk.rn = (pl.h DIV 101) % @nk + 1
  LEFT JOIN tmp_hosp ho ON ho.rn = (pl.h DIV 13) % GREATEST(@nh, 1) + 1
) x;

ALTER TABLE tmp_full
  ADD COLUMN confirmed_at DATETIME, ADD COLUMN assigned_at DATETIME, ADD COLUMN printed_at DATETIME,
  ADD COLUMN bk_num INT, ADD COLUMN inv_num INT, ADD COLUMN booking_no VARCHAR(20), ADD COLUMN invoice_no VARCHAR(20);

UPDATE tmp_full SET
  confirmed_at = created_at + INTERVAL (20 + h % 100) MINUTE,
  assigned_at  = created_at + INTERVAL (20 + h % 100) MINUTE + INTERVAL (2 + h % 5) HOUR,
  printed_at   = IF(final_status = 'invoice_printed', LEAST(delivered_at + INTERVAL (1 + h % 20) HOUR, CAST(@now AS DATETIME) - INTERVAL 1 HOUR), NULL);

-- ---------- BK-YYYY-##### / INV-YYYY-##### continuing the real counters ----------
DROP TEMPORARY TABLE IF EXISTS tmp_nums;
CREATE TEMPORARY TABLE tmp_nums AS
SELECT f.employee_id, f.service_date,
       ROW_NUMBER() OVER (PARTITION BY YEAR(f.created_at) ORDER BY f.created_at, f.employee_id)
         + COALESCE((SELECT s.last_value FROM sequences s WHERE s.name = 'booking' AND s.year = YEAR(f.created_at)), 0) AS bk_num,
       ROW_NUMBER() OVER (PARTITION BY YEAR(f.delivered_at) ORDER BY f.delivered_at, f.employee_id)
         + COALESCE((SELECT s.last_value FROM sequences s WHERE s.name = 'invoice' AND s.year = YEAR(f.delivered_at)), 0) AS inv_num
FROM tmp_full f;

UPDATE tmp_full f JOIN tmp_nums n ON n.employee_id = f.employee_id AND n.service_date = f.service_date
SET f.bk_num = n.bk_num, f.inv_num = n.inv_num,
    f.booking_no = CONCAT('BK-', YEAR(f.created_at), '-', LPAD(n.bk_num, 5, '0')),
    f.invoice_no = CONCAT('INV-', YEAR(f.delivered_at), '-', LPAD(n.inv_num, 5, '0'));

-- All timestamps below are Sri Lanka time; "+ INTERVAL @utc MINUTE" stores them in UTC.

-- ---------- bookings ----------
INSERT INTO bookings
  (booking_no, customer_id, patient_id, service_date, start_time, package_id, package_name, duration_hours,
   location_type, hospital_id, ward_no, bed_no, service_address, rate, status, employee_id, branch_id, notes,
   created_by, confirmed_by, confirmed_at, assigned_by, assigned_at, delivered_by, delivered_at, created_at)
SELECT booking_no, customer_id, patient_id, service_date, start_time, package_id, package_name, duration_hours,
       IF(hospital_id IS NULL, 'home', 'hospital'), hospital_id,
       IF(hospital_id IS NULL, NULL, CAST(1 + h % 12 AS CHAR)), IF(hospital_id IS NULL, NULL, CAST(1 + h % 30 AS CHAR)),
       IF(hospital_id IS NULL, LEFT(addr, 255), NULL),
       price, final_status, employee_id, branch_id, 'Sample session',
       @caller, @caller, confirmed_at + INTERVAL @utc MINUTE, @caller, assigned_at + INTERVAL @utc MINUTE,
       @caller, delivered_at + INTERVAL @utc MINUTE, created_at + INTERVAL @utc MINUTE
FROM tmp_full;

-- a normal table (not TEMPORARY): MySQL can't read one temporary table
-- several times in the same statement (the UNION ALL below).
DROP TABLE IF EXISTS zz_sample_ids;
CREATE TABLE zz_sample_ids AS
SELECT b.id AS booking_id, f.*
FROM tmp_full f JOIN bookings b ON b.booking_no = f.booking_no;

START TRANSACTION;

-- ---------- history (what the journey and the activity report read) ----------
INSERT INTO booking_status_logs (booking_id, from_status, to_status, user_id, employee_id, note, created_at)
SELECT booking_id, NULL, 'pending', @caller, NULL, NULL, created_at + INTERVAL @utc MINUTE FROM zz_sample_ids
UNION ALL SELECT booking_id, 'pending', 'confirmed', @caller, NULL, NULL, confirmed_at + INTERVAL @utc MINUTE FROM zz_sample_ids
UNION ALL SELECT booking_id, 'confirmed', 'assigned', @caller, employee_id, NULL, assigned_at + INTERVAL @utc MINUTE FROM zz_sample_ids
UNION ALL SELECT booking_id, 'assigned', 'delivered', @caller, NULL, NULL, delivered_at + INTERVAL @utc MINUTE FROM zz_sample_ids
UNION ALL SELECT booking_id, 'delivered', 'invoice_printed', @caller, NULL, NULL, printed_at + INTERVAL @utc MINUTE FROM zz_sample_ids WHERE final_status = 'invoice_printed'
ORDER BY 1, 7;

-- ---------- invoices (created on delivery, printed afterwards) ----------
INSERT INTO invoices
  (invoice_no, booking_id, customer_id, branch_id, invoice_date, rate, qty, amount, status, print_count,
   printed_by, printed_at, created_by, created_at)
SELECT invoice_no, booking_id, customer_id, branch_id, DATE(delivered_at), price, 1.00, price,
       IF(final_status = 'invoice_printed', 'printed', 'generated'), IF(final_status = 'invoice_printed', 1, 0),
       IF(final_status = 'invoice_printed', @caller, NULL), printed_at + INTERVAL @utc MINUTE, @caller, delivered_at + INTERVAL @utc MINUTE
FROM zz_sample_ids;

-- ---------- move the counters on ----------
INSERT INTO sequences (`name`, `year`, `last_value`)
SELECT 'booking', YEAR(created_at), MAX(bk_num) FROM tmp_full GROUP BY YEAR(created_at)
ON DUPLICATE KEY UPDATE `last_value` = GREATEST(`last_value`, VALUES(`last_value`));
INSERT INTO sequences (`name`, `year`, `last_value`)
SELECT 'invoice', YEAR(delivered_at), MAX(inv_num) FROM tmp_full GROUP BY YEAR(delivered_at)
ON DUPLICATE KEY UPDATE `last_value` = GREATEST(`last_value`, VALUES(`last_value`));

COMMIT;

-- ---------- what was added ----------
SELECT COUNT(*) AS sessions_added,
       SUM(final_status = 'invoice_printed') AS finished_invoice_printed,
       SUM(final_status = 'delivered') AS delivered_not_printed,
       COUNT(DISTINCT employee_id) AS employees
FROM tmp_full;

DROP TEMPORARY TABLE IF EXISTS tmp_days, tmp_emps, tmp_pats, tmp_pkgs, tmp_hosp, tmp_plan, tmp_full, tmp_nums;
DROP TABLE IF EXISTS zz_sample_ids;
