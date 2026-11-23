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
