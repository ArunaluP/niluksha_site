-- =====================================================================
-- Migration 015: booking confirmation on WhatsApp
--   mysql> SOURCE D:/Niluksha_system/database/migrations/015_booking_links.sql;
-- Run ONCE, after 014.  (or: npm run db:migrate -- --apply)
--
-- booking_links  secret 7-day links to a booking confirmation, sent to the
--                customer on WhatsApp (same rules as invoice_links: only the
--                SHA-256 of the secret is stored)
-- =====================================================================
USE care_booking;

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
