-- =====================================================================
-- Migration 004: patients.relationship_other
-- When a patient's relationship to the customer is "Other", this holds the
-- real relationship (e.g. Grandmother, Neighbour). Required by the app then.
--   mysql> SOURCE D:/Niluksha_system/database/migrations/004_relationship_other.sql;
-- Run ONCE, after 003.
-- =====================================================================
USE care_booking;

ALTER TABLE patients ADD COLUMN relationship_other VARCHAR(60) NULL AFTER relationship;

-- Existing "other" patients: fill in later from the customer page (Edit patient).
SELECT patient_no, full_name, relationship, relationship_other FROM patients WHERE relationship = 'other';
