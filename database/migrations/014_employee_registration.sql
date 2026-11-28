-- =====================================================================
-- Migration 014: employee registration form (paper form -> system)
--   mysql> SOURCE D:/Niluksha_system/database/migrations/014_employee_registration.sql;
-- Run ONCE, after 013.  (or: npm run db:migrate -- --apply)
--
-- file_no              the employee number written on the paper form
--                      (EMP-0001 stays as the system number)
-- gn_division .. nearest_post_office   where the employee lives
-- guardian_*           guardian details
-- doc_*                documents handed over (ticked = received)
-- heard_from           how they heard about the job; referred_by = the
--                      employee who referred them (when heard_from = employee)
-- rules_agreed_at/_by  when the rules & declaration were accepted, and which
--                      staff login recorded it
-- employee_photos      one webcam photo per employee (JPEG, kept in MySQL so
--                      it is in every backup)
-- =====================================================================
USE care_booking;

ALTER TABLE employees
  ADD COLUMN file_no                  VARCHAR(30)  NULL AFTER emp_no,
  ADD COLUMN gn_division              VARCHAR(100) NULL AFTER address,
  ADD COLUMN district                 VARCHAR(30)  NULL AFTER gn_division,
  ADD COLUMN nearest_police           VARCHAR(100) NULL AFTER district,
  ADD COLUMN nearest_post_office      VARCHAR(100) NULL AFTER nearest_police,
  ADD COLUMN guardian_name            VARCHAR(160) NULL AFTER nearest_post_office,
  ADD COLUMN guardian_relationship    VARCHAR(60)  NULL AFTER guardian_name,
  ADD COLUMN guardian_address         VARCHAR(255) NULL AFTER guardian_relationship,
  ADD COLUMN guardian_phone           VARCHAR(20)  NULL AFTER guardian_address,
  ADD COLUMN doc_gn_certificate        BOOLEAN NOT NULL DEFAULT FALSE AFTER guardian_phone,
  ADD COLUMN doc_nic_copy              BOOLEAN NOT NULL DEFAULT FALSE AFTER doc_gn_certificate,
  ADD COLUMN doc_police_certificate    BOOLEAN NOT NULL DEFAULT FALSE AFTER doc_nic_copy,
  ADD COLUMN doc_character_certificate BOOLEAN NOT NULL DEFAULT FALSE AFTER doc_police_certificate,
  ADD COLUMN doc_birth_certificate     BOOLEAN NOT NULL DEFAULT FALSE AFTER doc_character_certificate,
  ADD COLUMN heard_from ENUM('poster','leaflet','newspaper','facebook','messenger','office','employee') NULL AFTER doc_birth_certificate,
  ADD COLUMN referred_by              INT UNSIGNED NULL AFTER heard_from,
  ADD COLUMN rules_agreed_at          DATETIME     NULL AFTER referred_by,
  ADD COLUMN rules_agreed_by          INT UNSIGNED NULL AFTER rules_agreed_at,
  ADD UNIQUE KEY uq_employees_file_no (file_no),
  ADD KEY idx_employees_referred_by (referred_by),
  ADD CONSTRAINT fk_employees_referred_by FOREIGN KEY (referred_by) REFERENCES employees(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_employees_rules_agreed_by FOREIGN KEY (rules_agreed_by) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE employee_photos (
  employee_id INT UNSIGNED NOT NULL PRIMARY KEY,
  mime        VARCHAR(20)  NOT NULL,
  data        MEDIUMBLOB   NOT NULL,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_employee_photos_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB;
