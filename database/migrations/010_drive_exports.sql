-- =====================================================================
-- Migration 010: Google Drive export + export log
--   mysql> SOURCE D:/Niluksha_system/database/migrations/010_drive_exports.sql;
-- Run ONCE, after 009.  (or: npm run db:migrate -- --apply)
--
-- google_drive_connection: the Google account the Director connected in
--   Settings (refresh token stored encrypted) and the folder exports go to.
-- export_logs: every Excel export - who, which report, which period, and
--   whether it was downloaded and/or saved to Drive (with the Drive link).
-- No changes to existing tables.
-- =====================================================================
USE care_booking;

-- ---------------------------------------------------------------------
-- Google Drive connection (one row: the account the Director connected)
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
-- Export log (who exported which report, and where it went)
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

