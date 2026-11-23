-- =====================================================================
-- Migration 005: optional email for customers and employees
--   mysql> SOURCE D:/Niluksha_system/database/migrations/005_email.sql;
-- Run ONCE, after 004.
-- =====================================================================
USE care_booking;

ALTER TABLE customers ADD COLUMN email VARCHAR(160) NULL AFTER alt_phone;
ALTER TABLE employees ADD COLUMN email VARCHAR(160) NULL AFTER alt_phone;
