-- =====================================================================
-- Niluksha Caregiver Booking System - Phase 1
-- MySQL 8 schema (InnoDB, utf8mb4)
-- =====================================================================

CREATE DATABASE IF NOT EXISTS care_booking
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE care_booking;

-- Every DATETIME is stored in UTC (the app shows it in Sri Lanka time).
-- Times MySQL fills in itself (CURRENT_TIMESTAMP) follow this session setting.
SET time_zone = '+00:00';

-- ---------------------------------------------------------------------
-- 1. Branches
-- ---------------------------------------------------------------------
CREATE TABLE branches (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code             VARCHAR(20)  NOT NULL,
  name             VARCHAR(120) NOT NULL,
  address          VARCHAR(255) NULL,
  phone            VARCHAR(20)  NULL,
  manager_user_id  INT UNSIGNED NULL,             -- FK added after users
  is_active        TINYINT(1)   NOT NULL DEFAULT 1,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_branches_code (code)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 2. Users (system logins)
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(120) NOT NULL,
  email          VARCHAR(160) NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  role           ENUM('admin','call_center','branch_manager') NOT NULL,
  branch_id      INT UNSIGNED NULL,               -- required when role = branch_manager
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  last_login_at  DATETIME     NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_branch (branch_id),
  CONSTRAINT fk_users_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB;

ALTER TABLE branches
  ADD CONSTRAINT fk_branches_manager
  FOREIGN KEY (manager_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- 3. Employees (caregivers) - each belongs to one branch
-- ---------------------------------------------------------------------
CREATE TABLE employees (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  emp_no          VARCHAR(20)  NOT NULL,
  file_no         VARCHAR(30)  NULL,                  -- employee number on the paper registration form
  branch_id       INT UNSIGNED NOT NULL,
  first_name      VARCHAR(60)  NOT NULL,
  middle_name     VARCHAR(80)  NULL,
  last_name       VARCHAR(60)  NOT NULL,
  full_name       VARCHAR(205) GENERATED ALWAYS AS (CONCAT_WS(' ', first_name, middle_name, last_name)) STORED, -- for display & search
  nic             VARCHAR(12)  NULL,
  gender          ENUM('male','female') NOT NULL,
  dob             DATE         NULL,
  phone           VARCHAR(20)  NOT NULL,
  alt_phone       VARCHAR(20)  NULL,
  email           VARCHAR(160) NULL,
  address         VARCHAR(255) NULL,
  gn_division     VARCHAR(100) NULL,                  -- Grama Niladhari division
  district        VARCHAR(30)  NULL,
  nearest_police  VARCHAR(100) NULL,
  nearest_post_office VARCHAR(100) NULL,
  guardian_name   VARCHAR(160) NULL,
  guardian_relationship VARCHAR(60) NULL,
  guardian_address VARCHAR(255) NULL,
  guardian_phone  VARCHAR(20)  NULL,
  doc_gn_certificate        BOOLEAN NOT NULL DEFAULT FALSE, -- documents handed over
  doc_nic_copy              BOOLEAN NOT NULL DEFAULT FALSE,
  doc_police_certificate    BOOLEAN NOT NULL DEFAULT FALSE,
  doc_character_certificate BOOLEAN NOT NULL DEFAULT FALSE,
  doc_birth_certificate     BOOLEAN NOT NULL DEFAULT FALSE,
  heard_from      ENUM('poster','leaflet','newspaper','facebook','messenger','office','employee') NULL,
  referred_by     INT UNSIGNED NULL,                  -- employee who referred them (heard_from = employee)
  rules_agreed_at DATETIME     NULL,                  -- rules & declaration accepted
  rules_agreed_by INT UNSIGNED NULL,                  -- staff login that recorded it
  designation     VARCHAR(60)  NOT NULL DEFAULT 'Caregiver',
  qualifications  TEXT         NULL,
  join_date       DATE         NULL,
  photo_url       VARCHAR(255) NULL,
  status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_employees_emp_no (emp_no),
  UNIQUE KEY uq_employees_nic (nic),
  UNIQUE KEY uq_employees_file_no (file_no),
  KEY idx_employees_branch_status (branch_id, status),
  KEY idx_employees_referred_by (referred_by),
  CONSTRAINT fk_employees_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_employees_referred_by FOREIGN KEY (referred_by) REFERENCES employees(id) ON DELETE SET NULL,
  CONSTRAINT fk_employees_rules_agreed_by FOREIGN KEY (rules_agreed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- One webcam photo per employee (JPEG). Kept in MySQL so it is in every backup.
CREATE TABLE employee_photos (
  employee_id INT UNSIGNED NOT NULL PRIMARY KEY,
  mime        VARCHAR(20)  NOT NULL,
  data        MEDIUMBLOB   NOT NULL,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_employee_photos_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 4. Employee leave (used by availability check)
-- ---------------------------------------------------------------------
CREATE TABLE employee_leaves (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id  INT UNSIGNED NOT NULL,
  from_date    DATE         NOT NULL,
  to_date      DATE         NOT NULL,
  reason       VARCHAR(255) NULL,
  created_by   INT UNSIGNED NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_leaves_emp_dates (employee_id, from_date, to_date),
  CONSTRAINT chk_leaves_dates CHECK (to_date >= from_date),
  CONSTRAINT fk_leaves_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_leaves_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 5. Hospitals
-- ---------------------------------------------------------------------
CREATE TABLE hospitals (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(150) NOT NULL,
  type        ENUM('private','government') NOT NULL,
  address     VARCHAR(255) NULL,
  city        VARCHAR(80)  NULL,
  phone       VARCHAR(20)  NULL,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_hospitals_name_city (name, city),
  KEY idx_hospitals_type (type)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 6. Customers (caller / payer)
-- ---------------------------------------------------------------------
CREATE TABLE customers (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_no  VARCHAR(20)  NOT NULL,
  first_name   VARCHAR(60)  NOT NULL,
  middle_name  VARCHAR(80)  NULL,
  last_name    VARCHAR(60)  NOT NULL,
  full_name    VARCHAR(205) GENERATED ALWAYS AS (CONCAT_WS(' ', first_name, middle_name, last_name)) STORED, -- for display & search
  nic          VARCHAR(12)  NULL,
  dob          DATE         NULL,               -- filled from the NIC when one is given
  phone        VARCHAR(20)  NOT NULL,
  alt_phone    VARCHAR(20)  NULL,
  phone_whatsapp     TINYINT(1)  NOT NULL DEFAULT 1, -- main phone is on WhatsApp (invoices are sent here first)
  alt_phone_whatsapp TINYINT(1)  NOT NULL DEFAULT 1, -- other phone is on WhatsApp
  whatsapp_phone     VARCHAR(20) NULL,               -- only when neither phone is on WhatsApp (optional)
  email        VARCHAR(160) NULL,
  address      VARCHAR(255) NULL,
  city         VARCHAR(80)  NULL,
  notes        TEXT         NULL,
  created_by   INT UNSIGNED NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_customers_no (customer_no),
  KEY idx_customers_phone (phone),
  KEY idx_customers_nic (nic),
  CONSTRAINT fk_customers_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 7. Patients (one customer -> many patients; customer may be the patient)
-- ---------------------------------------------------------------------
CREATE TABLE patients (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_no    VARCHAR(20)  NOT NULL,
  customer_id   INT UNSIGNED NOT NULL,
  first_name    VARCHAR(60)  NOT NULL,
  middle_name   VARCHAR(80)  NULL,
  last_name     VARCHAR(60)  NOT NULL,
  full_name     VARCHAR(205) GENERATED ALWAYS AS (CONCAT_WS(' ', first_name, middle_name, last_name)) STORED, -- for display & search
  gender        ENUM('male','female') NOT NULL,
  dob           DATE         NULL,
  relationship  ENUM('self','parent','spouse','child','sibling','other') NOT NULL DEFAULT 'self',
  relationship_other VARCHAR(60) NULL,           -- the real relationship when 'other' (e.g. Grandmother)
  address       VARCHAR(255) NULL,
  care_notes    TEXT         NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_patients_no (patient_no),
  KEY idx_patients_customer (customer_id),
  CONSTRAINT fk_patients_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 7b. Packages (what a booking sells: e.g. "Standard 24 hours" - Rs 4,500)
--     Price and hours are copied onto each booking, so changing a package
--     never changes existing bookings or invoices.
-- ---------------------------------------------------------------------
CREATE TABLE packages (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(80)  NOT NULL,
  duration_hours  TINYINT UNSIGNED NOT NULL,      -- 1 to 24
  price           DECIMAL(10,2) NOT NULL,
  description     VARCHAR(255) NULL,
  is_default      TINYINT(1)   NOT NULL DEFAULT 0, -- pre-selected on new bookings (exactly one)
  is_active       TINYINT(1)   NOT NULL DEFAULT 1, -- inactive = hidden from the booking form
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_packages_name (name)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 8. Bookings (one-time 24h care session) - the core table
--    pending -> confirmed | ignored
--    confirmed -> assigned -> delivered (invoice auto-created) -> invoice_printed
-- ---------------------------------------------------------------------
CREATE TABLE bookings (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_no       VARCHAR(20)  NOT NULL,
  customer_id      INT UNSIGNED NOT NULL,
  patient_id       INT UNSIGNED NOT NULL,
  service_date     DATE         NOT NULL,             -- first day
  days             TINYINT UNSIGNED NOT NULL DEFAULT 1, -- number of days in a row (1-30), same caregiver
  end_date         DATE GENERATED ALWAYS AS (service_date + INTERVAL (days - 1) DAY) STORED, -- last day
  start_time       TIME         NOT NULL DEFAULT '08:00:00',
  package_id       INT UNSIGNED NULL,             -- the package chosen (NULL only for very old rows)
  package_name     VARCHAR(80)  NULL,             -- copied from the package (invoice text)
  duration_hours   TINYINT UNSIGNED NOT NULL DEFAULT 24, -- copied from the package
  location_type    ENUM('home','hospital') NOT NULL,
  hospital_id      INT UNSIGNED NULL,             -- required when location_type = hospital
  ward_no          VARCHAR(60)  NULL,             -- required when location_type = hospital
  bed_no           VARCHAR(30)  NULL,
  service_address  VARCHAR(255) NULL,             -- required when location_type = home
  rate             DECIMAL(10,2) NOT NULL,        -- copied from the package price
  status           ENUM('pending','confirmed','ignored','assigned','delivered','invoice_printed')
                   NOT NULL DEFAULT 'pending',
  employee_id      INT UNSIGNED NULL,             -- set on assignment
  branch_id        INT UNSIGNED NULL,             -- copied from employee on assignment
  notes            TEXT         NULL,
  created_by       INT UNSIGNED NOT NULL,
  confirmed_by     INT UNSIGNED NULL,
  confirmed_at     DATETIME     NULL,
  ignored_by       INT UNSIGNED NULL,
  ignored_at       DATETIME     NULL,
  assigned_by      INT UNSIGNED NULL,
  assigned_at      DATETIME     NULL,
  delivered_by     INT UNSIGNED NULL,
  delivered_at     DATETIME     NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Double-booking guard: one active booking per employee per date
  -- (NULL when not active, and UNIQUE allows many NULLs)
  busy_employee_id INT UNSIGNED GENERATED ALWAYS AS (
    CASE WHEN status IN ('assigned','delivered','invoice_printed')
         THEN employee_id ELSE NULL END
  ) STORED,

  UNIQUE KEY uq_bookings_no (booking_no),
  UNIQUE KEY uq_bookings_busy (busy_employee_id, service_date),
  KEY idx_bookings_date_status (service_date, status),
  KEY idx_bookings_customer_date (customer_id, service_date),
  KEY idx_bookings_patient (patient_id),
  KEY idx_bookings_employee_date (employee_id, service_date),
  KEY idx_bookings_employee_range (employee_id, service_date, end_date), -- caregiver busy on any day of a booking
  KEY idx_bookings_branch_date (branch_id, service_date),
  KEY idx_bookings_hospital (hospital_id),
  KEY idx_bookings_package (package_id),

  CONSTRAINT fk_bookings_customer  FOREIGN KEY (customer_id)  REFERENCES customers(id),
  CONSTRAINT fk_bookings_patient   FOREIGN KEY (patient_id)   REFERENCES patients(id),
  CONSTRAINT fk_bookings_hospital  FOREIGN KEY (hospital_id)  REFERENCES hospitals(id),
  CONSTRAINT fk_bookings_package   FOREIGN KEY (package_id)   REFERENCES packages(id),
  CONSTRAINT fk_bookings_employee  FOREIGN KEY (employee_id)  REFERENCES employees(id),
  CONSTRAINT fk_bookings_branch    FOREIGN KEY (branch_id)    REFERENCES branches(id),
  CONSTRAINT fk_bookings_created   FOREIGN KEY (created_by)   REFERENCES users(id),
  CONSTRAINT fk_bookings_confirmed FOREIGN KEY (confirmed_by) REFERENCES users(id),
  CONSTRAINT fk_bookings_ignored   FOREIGN KEY (ignored_by)   REFERENCES users(id),
  CONSTRAINT fk_bookings_assigned  FOREIGN KEY (assigned_by)  REFERENCES users(id),
  CONSTRAINT fk_bookings_delivered FOREIGN KEY (delivered_by) REFERENCES users(id)
) ENGINE=InnoDB;
-- Rules "home needs service_address" / "hospital needs hospital_id" are
-- enforced in the app (Zod + server action), because MySQL does not allow
-- CHECK constraints on foreign-key columns.

-- ---------------------------------------------------------------------
-- 9. Booking status history (confirm / ignore / assign / deliver / print)
-- ---------------------------------------------------------------------
CREATE TABLE booking_status_logs (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id   INT UNSIGNED NOT NULL,
  from_status  ENUM('pending','confirmed','ignored','assigned','delivered','invoice_printed') NULL,
  to_status    ENUM('pending','confirmed','ignored','assigned','delivered','invoice_printed') NOT NULL,
  user_id      INT UNSIGNED NOT NULL,
  employee_id  INT UNSIGNED NULL,               -- "-> assigned" logs: who was assigned
  note         VARCHAR(255) NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_logs_booking (booking_id, created_at),
  KEY idx_logs_created (created_at),            -- Reports: events in a date range
  KEY idx_logs_employee (employee_id),
  CONSTRAINT fk_logs_booking  FOREIGN KEY (booking_id)  REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_logs_user     FOREIGN KEY (user_id)     REFERENCES users(id),
  CONSTRAINT fk_logs_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 10. Invoices (one per booking, auto-created on delivery)
-- ---------------------------------------------------------------------
CREATE TABLE invoices (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_no    VARCHAR(20)   NOT NULL,
  booking_id    INT UNSIGNED  NOT NULL,
  customer_id   INT UNSIGNED  NOT NULL,
  branch_id     INT UNSIGNED  NOT NULL,
  invoice_date  DATE          NOT NULL,
  rate          DECIMAL(10,2) NOT NULL,
  qty           DECIMAL(6,2)  NOT NULL DEFAULT 1.00,
  amount        DECIMAL(12,2) NOT NULL,
  status        ENUM('generated','printed') NOT NULL DEFAULT 'generated',
  print_count   INT UNSIGNED  NOT NULL DEFAULT 0,
  printed_by    INT UNSIGNED  NULL,
  printed_at    DATETIME      NULL,
  created_by    INT UNSIGNED  NOT NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_invoices_no (invoice_no),
  UNIQUE KEY uq_invoices_booking (booking_id),
  KEY idx_invoices_branch_date (branch_id, invoice_date),
  KEY idx_invoices_customer (customer_id),
  KEY idx_invoices_status (status),
  CONSTRAINT fk_invoices_booking    FOREIGN KEY (booking_id)  REFERENCES bookings(id),
  CONSTRAINT fk_invoices_customer   FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_invoices_branch     FOREIGN KEY (branch_id)   REFERENCES branches(id),
  CONSTRAINT fk_invoices_printed_by FOREIGN KEY (printed_by)  REFERENCES users(id),
  CONSTRAINT fk_invoices_created_by FOREIGN KEY (created_by)  REFERENCES users(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 11. Settings (key / value)
-- ---------------------------------------------------------------------
CREATE TABLE settings (
  setting_key  VARCHAR(60)  NOT NULL PRIMARY KEY,
  value        VARCHAR(255) NOT NULL,
  updated_by   INT UNSIGNED NULL,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_settings_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 12. Sequences (readable numbers: CUS-00001, BK-2026-00001, INV-2026-00001)
--     Use: SELECT ... FOR UPDATE inside the same transaction, then +1
-- ---------------------------------------------------------------------
CREATE TABLE sequences (
  `name`      VARCHAR(30)       NOT NULL,       -- customer, patient, employee, booking, invoice
  `year`      SMALLINT UNSIGNED NOT NULL DEFAULT 0, -- 0 = not reset yearly
  `last_value` INT UNSIGNED      NOT NULL DEFAULT 0,
  PRIMARY KEY (`name`, `year`)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 13. Google Drive connection (one row: the account the Director connected)
--     The refresh token is AES-256-GCM encrypted by the app; never shown.
-- ---------------------------------------------------------------------
CREATE TABLE google_drive_connection (
  id                 TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1, -- always 1
  account_email      VARCHAR(160) NOT NULL,
  refresh_token_enc  TEXT         NOT NULL,
  folder_id          VARCHAR(120) NULL,         -- where exports go (from the pasted link)
  folder_name        VARCHAR(255) NULL,
  folder_link        VARCHAR(500) NULL,
  last_error         VARCHAR(255) NULL,         -- e.g. access removed in Google; shown in Settings
  connected_by       INT UNSIGNED NOT NULL,
  connected_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_gdrive_user FOREIGN KEY (connected_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 14. Export log (who exported which report, and where it went)
-- ---------------------------------------------------------------------
CREATE TABLE export_logs (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id        INT UNSIGNED NOT NULL,
  report         ENUM('activity','employees','employee') NOT NULL,
  period_from    DATE         NOT NULL,
  period_to      DATE         NOT NULL,
  branch_id      INT UNSIGNED NULL,
  subject        VARCHAR(40)  NULL,             -- e.g. EMP-0007 for one employee
  file_name      VARCHAR(255) NOT NULL,
  rows_count     INT UNSIGNED NOT NULL DEFAULT 0,
  destination    ENUM('download','drive','both') NOT NULL,
  drive_file_id  VARCHAR(120) NULL,
  drive_link     VARCHAR(500) NULL,
  status         ENUM('ok','failed') NOT NULL DEFAULT 'ok',
  error          VARCHAR(255) NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_exports_created (created_at),
  KEY idx_exports_user (user_id),
  CONSTRAINT fk_exports_user   FOREIGN KEY (user_id)   REFERENCES users(id),
  CONSTRAINT fk_exports_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 15. Invoice links (the 7-day link sent on WhatsApp to view / download the invoice PDF)
-- ---------------------------------------------------------------------
CREATE TABLE invoice_links (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_id      INT UNSIGNED NOT NULL,
  token_hash      CHAR(64)     NOT NULL,          -- SHA-256 of the secret in the link (the link itself is never stored)
  expires_at      DATETIME     NOT NULL,          -- 7 days after it was made
  disabled_at     DATETIME     NULL,              -- staff stopped it ("Disable links")
  views           INT UNSIGNED NOT NULL DEFAULT 0,
  last_viewed_at  DATETIME     NULL,
  created_by      INT UNSIGNED NOT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_invoice_links_token (token_hash),
  KEY idx_invoice_links_invoice (invoice_id),
  CONSTRAINT fk_invoice_links_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  CONSTRAINT fk_invoice_links_user    FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- Secret 7-day links to a booking confirmation, sent to the customer on WhatsApp.
CREATE TABLE booking_links (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id      INT UNSIGNED NOT NULL,
  token_hash      CHAR(64)     NOT NULL,          -- SHA-256 of the secret in the link (the link itself is never stored)
  expires_at      DATETIME     NOT NULL,          -- 7 days after it was made
  disabled_at     DATETIME     NULL,              -- staff stopped it ("Disable links")
  views           INT UNSIGNED NOT NULL DEFAULT 0,
  last_viewed_at  DATETIME     NULL,
  created_by      INT UNSIGNED NOT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_booking_links_token (token_hash),
  KEY idx_booking_links_booking (booking_id),
  CONSTRAINT fk_booking_links_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_booking_links_user    FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------
INSERT INTO packages (name, duration_hours, price, description, is_default) VALUES
  ('Standard 24 hours', 24, 4500.00, 'One caregiver for a full 24-hour session', 1);

INSERT INTO settings (setting_key, value) VALUES
  ('invoice_prefix',   'INV'),
  ('booking_prefix',   'BK'),
  ('company_name',     'Company name here'),
  ('company_address',  'Company address here'),
  ('company_phone',    '000 000 0000'),
  ('db_time_zone',     'UTC')  -- marker: times are stored in UTC (migration 011);

-- ---------------------------------------------------------------------
-- Availability query (free employees for a date, all branches)
-- ---------------------------------------------------------------------
-- SELECT e.id, e.emp_no, e.full_name, e.designation, b.name AS branch
-- FROM employees e
-- JOIN branches b ON b.id = e.branch_id
-- WHERE e.status = 'active'
--   AND NOT EXISTS (SELECT 1 FROM employee_leaves l
--                   WHERE l.employee_id = e.id
--                     AND :service_date BETWEEN l.from_date AND l.to_date)
--   AND NOT EXISTS (SELECT 1 FROM bookings bk
--                   WHERE bk.employee_id = e.id
--                     AND bk.service_date = :service_date
--                     AND bk.status IN ('assigned','delivered','invoice_printed'))
-- ORDER BY b.name, e.full_name;
