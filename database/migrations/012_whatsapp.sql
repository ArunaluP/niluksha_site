-- =====================================================================
-- Migration 012: WhatsApp number on customers + invoice links
--   mysql> SOURCE D:/Niluksha_system/database/migrations/012_whatsapp.sql;
-- Run ONCE, after 011.  (or: npm run db:migrate -- --apply)
--
-- customers: which phone is on WhatsApp (both ticked by default, so existing
--   customers get invoices on their main phone), or a separate WhatsApp number.
-- invoice_links: the secret 7-day link in the WhatsApp message that opens the
--   invoice PDF (only a SHA-256 of the secret is stored).
-- =====================================================================
USE care_booking;

ALTER TABLE customers
  ADD COLUMN phone_whatsapp     TINYINT(1)  NOT NULL DEFAULT 1 AFTER alt_phone,
  ADD COLUMN alt_phone_whatsapp TINYINT(1)  NOT NULL DEFAULT 1 AFTER phone_whatsapp,
  ADD COLUMN whatsapp_phone     VARCHAR(20) NULL AFTER alt_phone_whatsapp;

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
