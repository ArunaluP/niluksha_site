-- =====================================================================
-- ALL schema changes since the first version (migrations 002 to 007)
-- Run ONCE on a database created from the ORIGINAL care_booking_schema.sql:
--   mysql> SOURCE D:/Niluksha_system/database/all_changes_002_to_007.sql;
-- Then run migration 008 (Reports index), which is not included here:
--   mysql> SOURCE D:/Niluksha_system/database/migrations/008_report_index.sql;
-- Take a backup first:  mysqldump -u root -p care_booking > backup.sql
-- (A NEW install doesn't need this - just run care_booking_schema.sql.)
-- =====================================================================

-- =====================================================================
-- Migration 002: split names into first / middle / last
-- Tables: employees, customers, patients
--
-- Run ONCE on an existing database (one created before this change):
--   mysql> SOURCE D:/Niluksha_system/database/migrations/002_split_names.sql;
--
-- Existing names are split automatically:
--   first word  -> first_name
--   last word   -> last_name
--   the rest    -> middle_name   (e.g. "Kumari Perera"            -> Kumari | - | Perera
--                                      "W. A. Nimali Fernando"   -> W. | A. Nimali | Fernando)
-- full_name becomes a generated column (always "first middle last"),
-- so lists, search and invoices keep working unchanged.
-- A one-word name gets the same word as first AND last name; fix it in the app.
-- =====================================================================
USE care_booking;

-- ---------- employees ----------
ALTER TABLE employees
  ADD COLUMN first_name  VARCHAR(60) NULL AFTER branch_id,
  ADD COLUMN middle_name VARCHAR(80) NULL AFTER first_name,
  ADD COLUMN last_name   VARCHAR(60) NULL AFTER middle_name;
UPDATE employees SET
  first_name  = LEFT(SUBSTRING_INDEX(TRIM(full_name), ' ', 1), 60),
  last_name   = LEFT(SUBSTRING_INDEX(TRIM(full_name), ' ', -1), 60),
  middle_name = NULLIF(TRIM(SUBSTRING(TRIM(full_name),
                  CHAR_LENGTH(SUBSTRING_INDEX(TRIM(full_name), ' ', 1)) + 1,
                  CHAR_LENGTH(TRIM(full_name)) - CHAR_LENGTH(SUBSTRING_INDEX(TRIM(full_name), ' ', 1)) - CHAR_LENGTH(SUBSTRING_INDEX(TRIM(full_name), ' ', -1)))), '');
ALTER TABLE employees
  MODIFY first_name VARCHAR(60) NOT NULL,
  MODIFY last_name  VARCHAR(60) NOT NULL,
  DROP COLUMN full_name;
ALTER TABLE employees
  ADD COLUMN full_name VARCHAR(205) GENERATED ALWAYS AS (CONCAT_WS(' ', first_name, middle_name, last_name)) STORED AFTER last_name;

-- ---------- customers ----------
ALTER TABLE customers
  ADD COLUMN first_name  VARCHAR(60) NULL AFTER customer_no,
  ADD COLUMN middle_name VARCHAR(80) NULL AFTER first_name,
  ADD COLUMN last_name   VARCHAR(60) NULL AFTER middle_name;
UPDATE customers SET
  first_name  = LEFT(SUBSTRING_INDEX(TRIM(full_name), ' ', 1), 60),
  last_name   = LEFT(SUBSTRING_INDEX(TRIM(full_name), ' ', -1), 60),
  middle_name = NULLIF(TRIM(SUBSTRING(TRIM(full_name),
                  CHAR_LENGTH(SUBSTRING_INDEX(TRIM(full_name), ' ', 1)) + 1,
                  CHAR_LENGTH(TRIM(full_name)) - CHAR_LENGTH(SUBSTRING_INDEX(TRIM(full_name), ' ', 1)) - CHAR_LENGTH(SUBSTRING_INDEX(TRIM(full_name), ' ', -1)))), '');
ALTER TABLE customers
  MODIFY first_name VARCHAR(60) NOT NULL,
  MODIFY last_name  VARCHAR(60) NOT NULL,
  DROP COLUMN full_name;
ALTER TABLE customers
  ADD COLUMN full_name VARCHAR(205) GENERATED ALWAYS AS (CONCAT_WS(' ', first_name, middle_name, last_name)) STORED AFTER last_name;

-- ---------- patients ----------
ALTER TABLE patients
  ADD COLUMN first_name  VARCHAR(60) NULL AFTER customer_id,
  ADD COLUMN middle_name VARCHAR(80) NULL AFTER first_name,
  ADD COLUMN last_name   VARCHAR(60) NULL AFTER middle_name;
UPDATE patients SET
  first_name  = LEFT(SUBSTRING_INDEX(TRIM(full_name), ' ', 1), 60),
  last_name   = LEFT(SUBSTRING_INDEX(TRIM(full_name), ' ', -1), 60),
  middle_name = NULLIF(TRIM(SUBSTRING(TRIM(full_name),
                  CHAR_LENGTH(SUBSTRING_INDEX(TRIM(full_name), ' ', 1)) + 1,
                  CHAR_LENGTH(TRIM(full_name)) - CHAR_LENGTH(SUBSTRING_INDEX(TRIM(full_name), ' ', 1)) - CHAR_LENGTH(SUBSTRING_INDEX(TRIM(full_name), ' ', -1)))), '');
ALTER TABLE patients
  MODIFY first_name VARCHAR(60) NOT NULL,
  MODIFY last_name  VARCHAR(60) NOT NULL,
  DROP COLUMN full_name;
ALTER TABLE patients
  ADD COLUMN full_name VARCHAR(205) GENERATED ALWAYS AS (CONCAT_WS(' ', first_name, middle_name, last_name)) STORED AFTER last_name;

SELECT 'employees' AS tbl, emp_no AS no, first_name, middle_name, last_name, full_name FROM employees LIMIT 3;
SELECT 'customers' AS tbl, customer_no AS no, first_name, middle_name, last_name, full_name FROM customers LIMIT 3;


-- =====================================================================
-- Migration 003: customers get a date of birth; DOB must match the NIC
--   mysql> SOURCE D:/Niluksha_system/database/migrations/003_customer_dob.sql;
-- Run ONCE, after 002_split_names.sql.
--
-- 1. Adds customers.dob
-- 2. Fills it from the NIC for customers that have one
-- 3. Corrects employees.dob (and gender) where they disagree with the NIC,
--    because the app now rejects a NIC and date of birth that don't match.
--
-- NIC: old = YY DDD ..., new = YYYY DDD ...; DDD = day of year (+500 for women),
-- counted on a 366-day calendar (Feb always has 29 days).
-- =====================================================================
USE care_booking;

ALTER TABLE customers ADD COLUMN dob DATE NULL AFTER nic;

-- Decodes a NIC into year / day / gender (NULL when the NIC isn't valid)
DROP TEMPORARY TABLE IF EXISTS nic_decoded;
CREATE TEMPORARY TABLE nic_decoded AS
SELECT 'customer' AS kind, id,
       CAST(IF(CHAR_LENGTH(nic) = 12, LEFT(nic, 4), CONCAT('19', LEFT(nic, 2))) AS UNSIGNED) AS y,
       CAST(IF(CHAR_LENGTH(nic) = 12, SUBSTRING(nic, 5, 3), SUBSTRING(nic, 3, 3)) AS UNSIGNED) AS d
FROM customers WHERE nic IS NOT NULL
UNION ALL
SELECT 'employee', id,
       CAST(IF(CHAR_LENGTH(nic) = 12, LEFT(nic, 4), CONCAT('19', LEFT(nic, 2))) AS UNSIGNED),
       CAST(IF(CHAR_LENGTH(nic) = 12, SUBSTRING(nic, 5, 3), SUBSTRING(nic, 3, 3)) AS UNSIGNED)
FROM employees WHERE nic IS NOT NULL;

ALTER TABLE nic_decoded ADD COLUMN gender VARCHAR(6), ADD COLUMN birth DATE;
UPDATE nic_decoded SET gender = IF(d > 500, 'female', 'male'), d = IF(d > 500, d - 500, d);
-- Day 60 is Feb 29: only real in leap years. After Feb, non-leap years are one day behind.
UPDATE nic_decoded
   SET birth = IF(d = 60 AND NOT ((y % 4 = 0 AND y % 100 <> 0) OR y % 400 = 0), NULL,
                 MAKEDATE(y, IF(d > 60 AND NOT ((y % 4 = 0 AND y % 100 <> 0) OR y % 400 = 0), d - 1, d)))
 WHERE d BETWEEN 1 AND 366 AND y >= 1900;

UPDATE customers c JOIN nic_decoded n ON n.kind = 'customer' AND n.id = c.id
   SET c.dob = n.birth
 WHERE n.birth IS NOT NULL;

UPDATE employees e JOIN nic_decoded n ON n.kind = 'employee' AND n.id = e.id
   SET e.dob = n.birth, e.gender = n.gender
 WHERE n.birth IS NOT NULL;

DROP TEMPORARY TABLE nic_decoded;

SELECT customer_no, nic, dob FROM customers WHERE nic IS NOT NULL LIMIT 5;


-- =====================================================================
-- Migration 004: patients.relationship_other
-- When a patient's relationship to the customer is "Other", this holds the
-- real relationship (e.g. Grandmother, Neighbour). Required by the app then.
--   mysql> SOURCE D:/Niluksha_system/database/migrations/004_relationship_other.sql;
-- Run ONCE, after 003.
-- =====================================================================
USE care_booking;

ALTER TABLE patients ADD COLUMN relationship_other VARCHAR(60) NULL AFTER relationship;

-- Existing "other" patients: fill in later from the customer page (Edit patient).
SELECT patient_no, full_name, relationship, relationship_other FROM patients WHERE relationship = 'other';


-- =====================================================================
-- Migration 005: optional email for customers and employees
--   mysql> SOURCE D:/Niluksha_system/database/migrations/005_email.sql;
-- Run ONCE, after 004.
-- =====================================================================
USE care_booking;

ALTER TABLE customers ADD COLUMN email VARCHAR(160) NULL AFTER alt_phone;
ALTER TABLE employees ADD COLUMN email VARCHAR(160) NULL AFTER alt_phone;


-- =====================================================================
-- Migration 006: hospital bookings get separate Ward no and Bed no
--   mysql> SOURCE D:/Niluksha_system/database/migrations/006_ward_bed.sql;
-- Run ONCE, after 005.
--
-- The old combined "ward_room" text is moved into ward_no; bed_no starts empty.
-- New hospital bookings need a ward no; bed no is optional.
-- =====================================================================
USE care_booking;

ALTER TABLE bookings
  ADD COLUMN ward_no VARCHAR(60) NULL AFTER hospital_id,
  ADD COLUMN bed_no  VARCHAR(30) NULL AFTER ward_no;

UPDATE bookings SET ward_no = NULLIF(TRIM(ward_room), '') WHERE location_type = 'hospital';

ALTER TABLE bookings DROP COLUMN ward_room;

SELECT booking_no, ward_no, bed_no FROM bookings WHERE location_type = 'hospital' LIMIT 5;


-- =====================================================================
-- Migration 007: care packages
--   mysql> SOURCE D:/Niluksha_system/database/migrations/007_packages.sql;
-- Run ONCE, after 006.
--
-- 1. Creates the packages table.
-- 2. Turns the current session rate (Settings) into the default package
--    "Standard 24 hours" and links every existing booking to it.
-- 3. Removes the old session_rate / session_hours settings (prices now live
--    in Packages, managed by the Director).
-- =====================================================================
USE care_booking;

CREATE TABLE packages (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(80)  NOT NULL,
  duration_hours  TINYINT UNSIGNED NOT NULL,
  price           DECIMAL(10,2) NOT NULL,
  description     VARCHAR(255) NULL,
  is_default      TINYINT(1)   NOT NULL DEFAULT 0,
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_packages_name (name)
) ENGINE=InnoDB;

INSERT INTO packages (name, duration_hours, price, description, is_default)
SELECT 'Standard 24 hours', 24,
       COALESCE((SELECT CAST(value AS DECIMAL(10,2)) FROM settings WHERE setting_key = 'session_rate'), 4500.00),
       'One caregiver for a full 24-hour session', 1;

ALTER TABLE bookings
  ADD COLUMN package_id   INT UNSIGNED NULL AFTER start_time,
  ADD COLUMN package_name VARCHAR(80)  NULL AFTER package_id,
  ADD KEY idx_bookings_package (package_id),
  ADD CONSTRAINT fk_bookings_package FOREIGN KEY (package_id) REFERENCES packages(id);

-- Existing bookings keep their own rate; they are just labelled with the standard package.
UPDATE bookings b JOIN packages p ON p.is_default = 1
   SET b.package_id = p.id, b.package_name = p.name;

DELETE FROM settings WHERE setting_key IN ('session_rate', 'session_hours');

SELECT id, name, duration_hours, price, is_default FROM packages;


