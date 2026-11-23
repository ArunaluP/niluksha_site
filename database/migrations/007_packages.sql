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
