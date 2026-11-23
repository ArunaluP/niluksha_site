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
