-- =====================================================================
-- Sample test data (20 records each): branches, hospitals, employees,
-- customers + patients.  TEST database only.
--   mysql> SOURCE D:/Niluksha_system/database/sample_data.sql;
-- Requires migrations 002 and 003 (or a database created from the current schema).
-- Safe to run again: rows that already exist are skipped (INSERT IGNORE).
-- =====================================================================
USE care_booking;
START TRANSACTION;

-- ---------- Branches (20) ----------
INSERT IGNORE INTO branches (code, name, address, phone) VALUES
  ('HO', 'Head Office - Colombo', 'No. 120, Galle Road, Colombo 03', '0112000000'),
  ('KDW', 'Kadawatha Branch', 'No. 45, Kandy Road, Kadawatha', '0112104729'),
  ('GMP', 'Gampaha Branch', 'No. 18, Bauddhaloka Mw, Gampaha', '0112209458'),
  ('KDY', 'Kandy Branch', 'No. 76, Peradeniya Road, Kandy', '0112314187'),
  ('NEG', 'Negombo Branch', 'No. 22, Main Street, Negombo', '0112418916'),
  ('KUR', 'Kurunegala Branch', 'No. 9, Colombo Road, Kurunegala', '0112523645'),
  ('GAL', 'Galle Branch', 'No. 31, Wakwella Road, Galle', '0112628374'),
  ('MTR', 'Matara Branch', 'No. 14, Anagarika Dharmapala Mw, Matara', '0112733103'),
  ('KLT', 'Kalutara Branch', 'No. 55, Galle Road, Kalutara', '0112837832'),
  ('PND', 'Panadura Branch', 'No. 8, Horana Road, Panadura', '0112942561'),
  ('MHR', 'Maharagama Branch', 'No. 101, High Level Road, Maharagama', '0113047290'),
  ('NGD', 'Nugegoda Branch', 'No. 27, Stanley Thilakaratne Mw, Nugegoda', '0113152019'),
  ('WTL', 'Wattala Branch', 'No. 60, Negombo Road, Wattala', '0113256748'),
  ('JAE', 'Ja-Ela Branch', 'No. 12, Colombo Road, Ja-Ela', '0113361477'),
  ('AVS', 'Avissawella Branch', 'No. 5, Ratnapura Road, Avissawella', '0113466206'),
  ('RTP', 'Ratnapura Branch', 'No. 40, Main Street, Ratnapura', '0113570935'),
  ('ANP', 'Anuradhapura Branch', 'No. 17, Maithripala Senanayake Mw, Anuradhapura', '0113675664'),
  ('BDL', 'Badulla Branch', 'No. 23, Lower Street, Badulla', '0113780393'),
  ('JFN', 'Jaffna Branch', 'No. 66, Hospital Road, Jaffna', '0113885122'),
  ('TCO', 'Trincomalee Branch', 'No. 11, Dockyard Road, Trincomalee', '0113989851');

-- ---------- Hospitals (20) ----------
INSERT IGNORE INTO hospitals (name, type, address, city, phone) VALUES
  ('Nawaloka Hospital', 'private', '23 Deshamanya H.K. Dharmadasa Mw', 'Colombo', '0112100000'),
  ('Asiri Central Hospital', 'private', '114 Norris Canal Road', 'Colombo', '0112191373'),
  ('Lanka Hospitals', 'private', '578 Elvitigala Mawatha', 'Colombo', '0112282746'),
  ('Durdans Hospital', 'private', '3 Alfred Place', 'Colombo', '0112374119'),
  ('Hemas Hospital', 'private', '389 Negombo Road', 'Wattala', '0112465492'),
  ('National Hospital of Sri Lanka', 'government', 'Regent Street', 'Colombo', '0112556865'),
  ('Colombo North Teaching Hospital', 'government', 'Thalagolla Road', 'Ragama', '0112648238'),
  ('District General Hospital', 'government', 'Hospital Road', 'Gampaha', '0112739611'),
  ('Teaching Hospital Kandy', 'government', 'William Gopallawa Mawatha', 'Kandy', '0112830984'),
  ('Suwasevana Hospital', 'private', 'Kandy Road', 'Kadawatha', '0112922357'),
  ('Ninewells Hospital', 'private', '55/1 Kirimandala Mawatha', 'Narahenpita', '0113013730'),
  ('Western Hospital', 'private', '218 Cotta Road', 'Colombo', '0113105103'),
  ('Asiri Hospital Kandy', 'private', '301 Peradeniya Road', 'Kandy', '0113196476'),
  ('Co-op Hospital', 'private', 'Kandy Road', 'Kiribathgoda', '0113287849'),
  ('Teaching Hospital Karapitiya', 'government', 'Karapitiya', 'Galle', '0113379222'),
  ('District General Hospital Matara', 'government', 'Hospital Road', 'Matara', '0113470595'),
  ('Teaching Hospital Kurunegala', 'government', 'Hospital Road', 'Kurunegala', '0113561968'),
  ('District General Hospital Negombo', 'government', 'Colombo Road', 'Negombo', '0113653341'),
  ('Base Hospital Homagama', 'government', 'High Level Road', 'Homagama', '0113744714'),
  ('Teaching Hospital Anuradhapura', 'government', 'Harischandra Mawatha', 'Anuradhapura', '0113836087');

-- ---------- Employees (20) ----------
-- 15 Caregivers/Nurses (can be assigned) + 5 office staff (never in the assign list).
INSERT IGNORE INTO employees (emp_no, branch_id, first_name, middle_name, last_name, nic, gender, dob, phone, address, designation, qualifications, join_date) VALUES
  ('EMP-0001', (SELECT id FROM branches WHERE code='KDW'), 'Kumari', NULL, 'Perera', '198370300001', 'female', '1983-07-21', '0771234501', 'Kadawatha', 'Caregiver', 'NVQ Level 3 - Elderly Care', '2021-02-04'),
  ('EMP-0002', (SELECT id FROM branches WHERE code='KDW'), 'Nimali', NULL, 'Fernando', '198654900002', 'female', '1986-02-18', '0771234502', 'Kadawatha', 'Nurse', 'BSc Nursing', '2022-03-07'),
  ('EMP-0003', (SELECT id FROM branches WHERE code='KDW'), 'Sunil', NULL, 'Jayasinghe', '198926000003', 'male', '1989-09-16', '0771234503', 'Kadawatha', 'Caregiver', 'NVQ Level 4 - Caregiving', '2023-04-10'),
  ('EMP-0004', (SELECT id FROM branches WHERE code='GMP'), 'Dilani', NULL, 'Wickramasinghe', '199272300004', 'female', '1992-08-10', '0771234504', 'Gampaha', 'Caregiver', 'First aid certificate', '2024-05-13'),
  ('EMP-0005', (SELECT id FROM branches WHERE code='GMP'), 'Chamari', NULL, 'Silva', '199554700005', 'female', '1995-02-16', '0771234505', 'Gampaha', 'Nurse', 'BSc Nursing', '2020-06-16'),
  ('EMP-0006', (SELECT id FROM branches WHERE code='GMP'), 'Ruwan', NULL, 'Bandara', '198106400006', 'male', '1981-03-04', '0771234506', 'Gampaha', 'Caregiver', 'NVQ Level 4 - Caregiving', '2021-07-19'),
  ('EMP-0007', (SELECT id FROM branches WHERE code='KDY'), 'Sanduni', NULL, 'Herath', '198479900007', 'female', '1984-10-25', '0771234507', 'Kandy', 'Caregiver', 'NVQ Level 3 - Elderly Care', '2022-08-22'),
  ('EMP-0008', (SELECT id FROM branches WHERE code='KDY'), 'W.', 'A. Anoma', 'Dissanayake', '198770400008', 'female', '1987-07-22', '0771234508', 'Kandy', 'Nurse', 'Diploma in Nursing', '2023-09-25'),
  ('EMP-0009', (SELECT id FROM branches WHERE code='HO'), 'Priyanka', NULL, 'Rathnayake', '199078600009', 'female', '1990-10-12', '0771234509', 'Colombo 03', 'Caregiver', 'NVQ Level 4 - Caregiving', '2024-10-01'),
  ('EMP-0010', (SELECT id FROM branches WHERE code='HO'), 'Tharindu', NULL, 'Gunawardena', '199307400010', 'male', '1993-03-14', '0771234510', 'Colombo 03', 'Nurse', 'Diploma in Nursing', '2020-11-04'),
  ('EMP-0011', (SELECT id FROM branches WHERE code='HO'), 'Ishara', NULL, 'Madushani', '199678700011', 'female', '1996-10-13', '0771234511', 'Colombo 03', 'Call Center', NULL, '2021-12-07'),
  ('EMP-0012', (SELECT id FROM branches WHERE code='KDW'), 'Lasantha', NULL, 'Kumara', '198205300012', 'male', '1982-02-22', '0771234512', 'Kadawatha', 'Branch Manager', NULL, '2022-01-10'),
  ('EMP-0013', (SELECT id FROM branches WHERE code='HO'), 'Nadeesha', NULL, 'Senanayake', '198582800013', 'female', '1985-11-23', '0771234513', 'Colombo 03', 'Manager', NULL, '2023-02-13'),
  ('EMP-0014', (SELECT id FROM branches WHERE code='NEG'), 'Malani', NULL, 'Peiris', '198855000014', 'female', '1988-02-19', '0771234514', 'Negombo', 'Caregiver', 'NVQ Level 3 - Elderly Care', '2024-03-16'),
  ('EMP-0015', (SELECT id FROM branches WHERE code='NEG'), 'Kasun', NULL, 'Rodrigo', '199131700015', 'male', '1991-11-12', '0771234515', 'Negombo', 'Nurse', 'Diploma in Nursing', '2020-04-19'),
  ('EMP-0016', (SELECT id FROM branches WHERE code='KUR'), 'Shanika', NULL, 'Ekanayake', '199477300016', 'female', '1994-09-29', '0771234516', 'Kurunegala', 'Caregiver', 'First aid certificate', '2021-05-22'),
  ('EMP-0017', (SELECT id FROM branches WHERE code='GAL'), 'Hiruni', NULL, 'Abeysekara', '198080000017', 'female', '1980-10-26', '0771234517', 'Galle', 'Nurse', 'BSc Nursing', '2022-06-25'),
  ('EMP-0018', (SELECT id FROM branches WHERE code='MTR'), 'Pradeep', NULL, 'Wijesuriya', '198312800018', 'male', '1983-05-07', '0771234518', 'Matara', 'Caregiver', 'NVQ Level 4 - Caregiving', '2023-07-01'),
  ('EMP-0019', (SELECT id FROM branches WHERE code='MHR'), 'Thilini', NULL, 'Jayawardena', '198654200019', 'female', '1986-02-11', '0771234519', 'Maharagama', 'Caregiver', 'Patient care certificate', '2024-08-04'),
  ('EMP-0020', (SELECT id FROM branches WHERE code='HO'), 'Sachini', NULL, 'Karunaratne', '198967600020', 'female', '1989-06-24', '0771234520', 'Colombo 03', 'Call Center', NULL, '2020-09-07');

-- ---------- Customers (20) ----------
SET @admin := (SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1);
INSERT IGNORE INTO customers (customer_no, first_name, middle_name, last_name, nic, dob, phone, address, city, created_by) VALUES
  ('CUS-00001', 'Ajith', NULL, 'Perera', '196611140001', '1966-04-20', '0719876501', 'No. 7, Temple Road, Kadawatha', 'Kadawatha', @admin),
  ('CUS-00002', 'Mala', NULL, 'Gunasekara', '196712240002', '1967-05-01', '0719876502', 'No. 14, Temple Road, Gampaha', 'Gampaha', @admin),
  ('CUS-00003', 'Rohan', 'Mahesh', 'Silva', '196813340003', '1968-05-12', '0719876503', 'No. 21, Temple Road, Colombo', 'Colombo', @admin),
  ('CUS-00004', 'Sriyani', NULL, 'Jayasuriya', '196914440004', '1969-05-23', '0719876504', 'No. 28, Temple Road, Kandy', 'Kandy', @admin),
  ('CUS-00005', 'Mahesh', NULL, 'Fernando', '197015540005', '1970-06-03', '0719876505', 'No. 35, Temple Road, Negombo', 'Negombo', @admin),
  ('CUS-00006', 'Kanthi', NULL, 'Wijeratne', '197116640006', '1971-06-14', '0719876506', 'No. 42, Temple Road, Ragama', 'Ragama', @admin),
  ('CUS-00007', 'Nuwan', NULL, 'Rajapaksha', '197217740007', '1972-06-25', '0719876507', 'No. 49, Temple Road, Kiribathgoda', 'Kiribathgoda', @admin),
  ('CUS-00008', 'Indika', NULL, 'Samarasinghe', '197318840008', '1973-07-06', '0719876508', 'No. 56, Temple Road, Kurunegala', 'Kurunegala', @admin),
  ('CUS-00009', 'Champika', NULL, 'Liyanage', '197419940009', '1974-07-17', '0719876509', 'No. 63, Temple Road, Galle', 'Galle', @admin),
  ('CUS-00010', 'Dinesh', NULL, 'Weerasinghe', '197521040010', '1975-07-28', '0719876510', 'No. 70, Temple Road, Matara', 'Matara', @admin),
  ('CUS-00011', 'Sumudu', NULL, 'Alwis', '197622140011', '1976-08-08', '0719876511', 'No. 77, Temple Road, Maharagama', 'Maharagama', @admin),
  ('CUS-00012', 'Chandana', NULL, 'Peris', '197723240012', '1977-08-19', '0719876512', 'No. 84, Temple Road, Wattala', 'Wattala', @admin),
  ('CUS-00013', 'Lakmini', NULL, 'Hettiarachchi', '197824340013', '1978-08-30', '0719876513', 'No. 91, Temple Road, Nugegoda', 'Nugegoda', @admin),
  ('CUS-00014', 'Asanka', NULL, 'Mendis', '197925440014', '1979-09-10', '0719876514', 'No. 98, Temple Road, Panadura', 'Panadura', @admin),
  ('CUS-00015', 'Gayani', NULL, 'Ranasinghe', '198026540015', '1980-09-21', '0719876515', 'No. 105, Temple Road, Kalutara', 'Kalutara', @admin),
  ('CUS-00016', 'Upul', NULL, 'Kumarasiri', '198127640016', '1981-10-02', '0719876516', 'No. 112, Temple Road, Ja-Ela', 'Ja-Ela', @admin),
  ('CUS-00017', 'Nirosha', NULL, 'Gamage', '198228740017', '1982-10-13', '0719876517', 'No. 119, Temple Road, Homagama', 'Homagama', @admin),
  ('CUS-00018', 'Janaka', NULL, 'Wanigasekara', '198329840018', '1983-10-24', '0719876518', 'No. 126, Temple Road, Avissawella', 'Avissawella', @admin),
  ('CUS-00019', 'Harsha', NULL, 'Pathirana', '198430940019', '1984-11-04', '0719876519', 'No. 133, Temple Road, Kadawatha', 'Kadawatha', @admin),
  ('CUS-00020', 'Dulani', NULL, 'Amarasinghe', '198532040020', '1985-11-15', '0719876520', 'No. 140, Temple Road, Colombo', 'Colombo', @admin);

-- ---------- Patients (20, one per customer) ----------
INSERT IGNORE INTO patients (patient_no, customer_id, first_name, middle_name, last_name, gender, dob, relationship, address, care_notes) VALUES
  ('PAT-00001', (SELECT id FROM customers WHERE customer_no='CUS-00001'), 'Somawathi', NULL, 'Perera', 'female', '1941-02-06', 'parent', 'No. 7, Temple Road, Kadawatha', 'Post-surgery recovery'),
  ('PAT-00002', (SELECT id FROM customers WHERE customer_no='CUS-00002'), 'Piyadasa', NULL, 'Gunasekara', 'male', '1942-03-11', 'parent', 'No. 14, Temple Road, Gampaha', 'Diabetic, needs meal support'),
  ('PAT-00003', (SELECT id FROM customers WHERE customer_no='CUS-00003'), 'Rohan', 'Mahesh', 'Silva', 'male', '1943-04-16', 'self', 'No. 21, Temple Road, Colombo', 'Needs help walking'),
  ('PAT-00004', (SELECT id FROM customers WHERE customer_no='CUS-00004'), 'Leelawathi', NULL, 'Jayasuriya', 'female', '1944-05-21', 'parent', 'No. 28, Temple Road, Kandy', 'Elderly care, mild dementia'),
  ('PAT-00005', (SELECT id FROM customers WHERE customer_no='CUS-00005'), 'Agnes', NULL, 'Fernando', 'female', '1945-06-26', 'parent', 'No. 35, Temple Road, Negombo', 'Bedridden, needs turning every 2 hours'),
  ('PAT-00006', (SELECT id FROM customers WHERE customer_no='CUS-00006'), 'Wimal', NULL, 'Wijeratne', 'male', '1946-07-04', 'spouse', 'No. 42, Temple Road, Ragama', 'Post-surgery recovery'),
  ('PAT-00007', (SELECT id FROM customers WHERE customer_no='CUS-00007'), 'Karunawathi', NULL, 'Rajapaksha', 'female', '1947-08-09', 'parent', 'No. 49, Temple Road, Kiribathgoda', 'Diabetic, needs meal support'),
  ('PAT-00008', (SELECT id FROM customers WHERE customer_no='CUS-00008'), 'Dayananda', NULL, 'Samarasinghe', 'male', '1948-09-14', 'parent', 'No. 56, Temple Road, Kurunegala', 'Needs help walking'),
  ('PAT-00009', (SELECT id FROM customers WHERE customer_no='CUS-00009'), 'Seetha', NULL, 'Liyanage', 'female', '1949-10-19', 'parent', 'No. 63, Temple Road, Galle', 'Elderly care, mild dementia'),
  ('PAT-00010', (SELECT id FROM customers WHERE customer_no='CUS-00010'), 'Hemapala', NULL, 'Weerasinghe', 'male', '1950-11-24', 'parent', 'No. 70, Temple Road, Matara', 'Bedridden, needs turning every 2 hours'),
  ('PAT-00011', (SELECT id FROM customers WHERE customer_no='CUS-00011'), 'Ranjani', NULL, 'Alwis', 'female', '1951-12-02', 'parent', 'No. 77, Temple Road, Maharagama', 'Post-surgery recovery'),
  ('PAT-00012', (SELECT id FROM customers WHERE customer_no='CUS-00012'), 'Mary', NULL, 'Peris', 'female', '1952-01-07', 'parent', 'No. 84, Temple Road, Wattala', 'Diabetic, needs meal support'),
  ('PAT-00013', (SELECT id FROM customers WHERE customer_no='CUS-00013'), 'Sunethra', NULL, 'Hettiarachchi', 'female', '1953-02-12', 'parent', 'No. 91, Temple Road, Nugegoda', 'Needs help walking'),
  ('PAT-00014', (SELECT id FROM customers WHERE customer_no='CUS-00014'), 'Bandula', NULL, 'Mendis', 'male', '1954-03-17', 'parent', 'No. 98, Temple Road, Panadura', 'Elderly care, mild dementia'),
  ('PAT-00015', (SELECT id FROM customers WHERE customer_no='CUS-00015'), 'Kusum', NULL, 'Ranasinghe', 'female', '1955-04-22', 'parent', 'No. 105, Temple Road, Kalutara', 'Bedridden, needs turning every 2 hours'),
  ('PAT-00016', (SELECT id FROM customers WHERE customer_no='CUS-00016'), 'Gunadasa', NULL, 'Kumarasiri', 'male', '1956-05-27', 'parent', 'No. 112, Temple Road, Ja-Ela', 'Post-surgery recovery'),
  ('PAT-00017', (SELECT id FROM customers WHERE customer_no='CUS-00017'), 'Nandawathi', NULL, 'Gamage', 'female', '1957-06-05', 'parent', 'No. 119, Temple Road, Homagama', 'Diabetic, needs meal support'),
  ('PAT-00018', (SELECT id FROM customers WHERE customer_no='CUS-00018'), 'Siripala', NULL, 'Wanigasekara', 'male', '1958-07-10', 'parent', 'No. 126, Temple Road, Avissawella', 'Needs help walking'),
  ('PAT-00019', (SELECT id FROM customers WHERE customer_no='CUS-00019'), 'Premawathi', NULL, 'Pathirana', 'female', '1959-08-15', 'parent', 'No. 133, Temple Road, Kadawatha', 'Elderly care, mild dementia'),
  ('PAT-00020', (SELECT id FROM customers WHERE customer_no='CUS-00020'), 'Ishan', NULL, 'Amarasinghe', 'male', '2015-04-10', 'child', 'No. 140, Temple Road, Colombo', 'Bedridden, needs turning every 2 hours');

-- Keep the running-number counters in step with the rows above,
-- so the next record added from the app continues the numbering.
INSERT INTO sequences (`name`, `year`, `last_value`) VALUES
  ('employee', 0, 20), ('customer', 0, 20), ('patient', 0, 20)
  ON DUPLICATE KEY UPDATE `last_value` = GREATEST(`last_value`, VALUES(`last_value`));

COMMIT;

SELECT 'branches' AS tbl, COUNT(*) AS rows_count FROM branches
UNION ALL SELECT 'hospitals', COUNT(*) FROM hospitals
UNION ALL SELECT 'employees', COUNT(*) FROM employees
UNION ALL SELECT 'customers', COUNT(*) FROM customers
UNION ALL SELECT 'patients',  COUNT(*) FROM patients;
