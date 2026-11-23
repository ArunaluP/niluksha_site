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
