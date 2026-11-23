/**
 * Drizzle schema — mirrors care_booking_schema.sql exactly.
 * The database is created by that SQL script; this file gives TypeScript types
 * and the query builder. If you change a table, change BOTH (or switch to
 * drizzle-kit migrations — see README).
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  datetime,
  decimal,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  smallint,
  text,
  time,
  tinyint,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * first / middle / last name, plus full_name which MySQL builds itself
 * ("first middle last") — read it for display and search, never write it.
 */
const personNameColumns = () => ({
  firstName: varchar("first_name", { length: 60 }).notNull(),
  middleName: varchar("middle_name", { length: 80 }),
  lastName: varchar("last_name", { length: 60 }).notNull(),
  fullName: varchar("full_name", { length: 205 })
    .notNull()
    .generatedAlwaysAs(sql`CONCAT_WS(' ', first_name, middle_name, last_name)`, { mode: "stored" }),
});


// ---------------------------------------------------------------------------
// Shared enums / helpers
// ---------------------------------------------------------------------------
export const USER_ROLES = ["admin", "call_center", "branch_manager"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "ignored",
  "assigned",
  "delivered",
  "invoice_printed",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Employee types. Only ASSIGNABLE ones can be sent to patients. */
export const DESIGNATIONS = ["Caregiver", "Nurse", "Branch Manager", "Call Center", "Manager"] as const;
export type Designation = (typeof DESIGNATIONS)[number];
export const ASSIGNABLE_DESIGNATIONS = ["Caregiver", "Nurse"] as const satisfies readonly Designation[];

const id = () => int("id", { unsigned: true }).autoincrement().primaryKey();
const fk = (name: string) => int(name, { unsigned: true });
const createdAt = () =>
  datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`);
const updatedAt = () =>
  datetime("updated_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`).$onUpdate(() => new Date());

// ---------------------------------------------------------------------------
// 1. branches
// ---------------------------------------------------------------------------
export const branches = mysqlTable(
  "branches",
  {
    id: id(),
    code: varchar("code", { length: 20 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    address: varchar("address", { length: 255 }),
    phone: varchar("phone", { length: 20 }),
    managerUserId: fk("manager_user_id"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("uq_branches_code").on(t.code)],
);

// ---------------------------------------------------------------------------
// 2. users (system logins)
// ---------------------------------------------------------------------------
export const users = mysqlTable(
  "users",
  {
    id: id(),
    name: varchar("name", { length: 120 }).notNull(),
    email: varchar("email", { length: 160 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    role: mysqlEnum("role", USER_ROLES).notNull(),
    branchId: fk("branch_id"),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: datetime("last_login_at", { mode: "date" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("uq_users_email").on(t.email), index("idx_users_branch").on(t.branchId)],
);

// ---------------------------------------------------------------------------
// 3. employees (caregivers)
// ---------------------------------------------------------------------------
export const employees = mysqlTable(
  "employees",
  {
    id: id(),
    empNo: varchar("emp_no", { length: 20 }).notNull(),
    branchId: fk("branch_id").notNull(),
    ...personNameColumns(),
    nic: varchar("nic", { length: 12 }),
    gender: mysqlEnum("gender", ["male", "female"]).notNull(),
    dob: date("dob", { mode: "string" }),
    phone: varchar("phone", { length: 20 }).notNull(),
    altPhone: varchar("alt_phone", { length: 20 }),
    email: varchar("email", { length: 160 }),
    address: varchar("address", { length: 255 }),
    designation: varchar("designation", { length: 60 }).notNull().default("Caregiver"),
    qualifications: text("qualifications"),
    joinDate: date("join_date", { mode: "string" }),
    photoUrl: varchar("photo_url", { length: 255 }),
    status: mysqlEnum("status", ["active", "inactive"]).notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_employees_emp_no").on(t.empNo),
    uniqueIndex("uq_employees_nic").on(t.nic),
    index("idx_employees_branch_status").on(t.branchId, t.status),
  ],
);

// ---------------------------------------------------------------------------
// 4. employee_leaves
// ---------------------------------------------------------------------------
export const employeeLeaves = mysqlTable(
  "employee_leaves",
  {
    id: id(),
    employeeId: fk("employee_id").notNull(),
    fromDate: date("from_date", { mode: "string" }).notNull(),
    toDate: date("to_date", { mode: "string" }).notNull(),
    reason: varchar("reason", { length: 255 }),
    createdBy: fk("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("idx_leaves_emp_dates").on(t.employeeId, t.fromDate, t.toDate)],
);

// ---------------------------------------------------------------------------
// 5. hospitals
// ---------------------------------------------------------------------------
export const hospitals = mysqlTable(
  "hospitals",
  {
    id: id(),
    name: varchar("name", { length: 150 }).notNull(),
    type: mysqlEnum("type", ["private", "government"]).notNull(),
    address: varchar("address", { length: 255 }),
    city: varchar("city", { length: 80 }),
    phone: varchar("phone", { length: 20 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("uq_hospitals_name_city").on(t.name, t.city), index("idx_hospitals_type").on(t.type)],
);

// ---------------------------------------------------------------------------
// 6. customers
// ---------------------------------------------------------------------------
export const customers = mysqlTable(
  "customers",
  {
    id: id(),
    customerNo: varchar("customer_no", { length: 20 }).notNull(),
    ...personNameColumns(),
    nic: varchar("nic", { length: 12 }),
    dob: date("dob", { mode: "string" }),
    phone: varchar("phone", { length: 20 }).notNull(),
    altPhone: varchar("alt_phone", { length: 20 }),
    email: varchar("email", { length: 160 }),
    address: varchar("address", { length: 255 }),
    city: varchar("city", { length: 80 }),
    notes: text("notes"),
    createdBy: fk("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_customers_no").on(t.customerNo),
    index("idx_customers_phone").on(t.phone),
    index("idx_customers_nic").on(t.nic),
  ],
);

// ---------------------------------------------------------------------------
// 7. patients
// ---------------------------------------------------------------------------
export const patients = mysqlTable(
  "patients",
  {
    id: id(),
    patientNo: varchar("patient_no", { length: 20 }).notNull(),
    customerId: fk("customer_id").notNull(),
    ...personNameColumns(),
    gender: mysqlEnum("gender", ["male", "female"]).notNull(),
    dob: date("dob", { mode: "string" }),
    relationship: mysqlEnum("relationship", ["self", "parent", "spouse", "child", "sibling", "other"])
      .notNull()
      .default("self"),
    relationshipOther: varchar("relationship_other", { length: 60 }),
    address: varchar("address", { length: 255 }),
    careNotes: text("care_notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("uq_patients_no").on(t.patientNo), index("idx_patients_customer").on(t.customerId)],
);

// ---------------------------------------------------------------------------
// 8. bookings
// ---------------------------------------------------------------------------
// 7b. packages (price + hours copied onto each booking)
// ---------------------------------------------------------------------------
export const packages = mysqlTable(
  "packages",
  {
    id: id(),
    name: varchar("name", { length: 80 }).notNull(),
    durationHours: tinyint("duration_hours", { unsigned: true }).notNull(),
    price: decimal("price", { precision: 10, scale: 2 }).notNull(),
    description: varchar("description", { length: 255 }),
    isDefault: boolean("is_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("uq_packages_name").on(t.name)],
);

// ---------------------------------------------------------------------------
export const bookings = mysqlTable(
  "bookings",
  {
    id: id(),
    bookingNo: varchar("booking_no", { length: 20 }).notNull(),
    customerId: fk("customer_id").notNull(),
    patientId: fk("patient_id").notNull(),
    serviceDate: date("service_date", { mode: "string" }).notNull(),
    startTime: time("start_time").notNull().default("08:00:00"),
    packageId: fk("package_id"),
    packageName: varchar("package_name", { length: 80 }),
    durationHours: tinyint("duration_hours", { unsigned: true }).notNull().default(24),
    locationType: mysqlEnum("location_type", ["home", "hospital"]).notNull(),
    hospitalId: fk("hospital_id"),
    wardNo: varchar("ward_no", { length: 60 }),
    bedNo: varchar("bed_no", { length: 30 }),
    serviceAddress: varchar("service_address", { length: 255 }),
    rate: decimal("rate", { precision: 10, scale: 2 }).notNull(),
    status: mysqlEnum("status", BOOKING_STATUSES).notNull().default("pending"),
    employeeId: fk("employee_id"),
    branchId: fk("branch_id"),
    notes: text("notes"),
    createdBy: fk("created_by").notNull(),
    confirmedBy: fk("confirmed_by"),
    confirmedAt: datetime("confirmed_at", { mode: "date" }),
    ignoredBy: fk("ignored_by"),
    ignoredAt: datetime("ignored_at", { mode: "date" }),
    assignedBy: fk("assigned_by"),
    assignedAt: datetime("assigned_at", { mode: "date" }),
    deliveredBy: fk("delivered_by"),
    deliveredAt: datetime("delivered_at", { mode: "date" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    // Generated by MySQL (double-booking guard) — never written by the app.
    busyEmployeeId: int("busy_employee_id", { unsigned: true }).generatedAlwaysAs(
      sql`CASE WHEN status IN ('assigned','delivered','invoice_printed') THEN employee_id ELSE NULL END`,
      { mode: "stored" },
    ),
  },
  (t) => [
    uniqueIndex("uq_bookings_no").on(t.bookingNo),
    uniqueIndex("uq_bookings_busy").on(t.busyEmployeeId, t.serviceDate),
    index("idx_bookings_date_status").on(t.serviceDate, t.status),
    index("idx_bookings_customer_date").on(t.customerId, t.serviceDate),
    index("idx_bookings_patient").on(t.patientId),
    index("idx_bookings_employee_date").on(t.employeeId, t.serviceDate),
    index("idx_bookings_branch_date").on(t.branchId, t.serviceDate),
    index("idx_bookings_hospital").on(t.hospitalId),
    index("idx_bookings_package").on(t.packageId),
  ],
);

// ---------------------------------------------------------------------------
// 9. booking_status_logs
// ---------------------------------------------------------------------------
export const bookingStatusLogs = mysqlTable(
  "booking_status_logs",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    bookingId: fk("booking_id").notNull(),
    fromStatus: mysqlEnum("from_status", BOOKING_STATUSES),
    toStatus: mysqlEnum("to_status", BOOKING_STATUSES).notNull(),
    userId: fk("user_id").notNull(),
    note: varchar("note", { length: 255 }),
    createdAt: createdAt(),
  },
  (t) => [index("idx_logs_booking").on(t.bookingId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// 10. invoices
// ---------------------------------------------------------------------------
export const invoices = mysqlTable(
  "invoices",
  {
    id: id(),
    invoiceNo: varchar("invoice_no", { length: 20 }).notNull(),
    bookingId: fk("booking_id").notNull(),
    customerId: fk("customer_id").notNull(),
    branchId: fk("branch_id").notNull(),
    invoiceDate: date("invoice_date", { mode: "string" }).notNull(),
    rate: decimal("rate", { precision: 10, scale: 2 }).notNull(),
    qty: decimal("qty", { precision: 6, scale: 2 }).notNull().default("1.00"),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    status: mysqlEnum("status", ["generated", "printed"]).notNull().default("generated"),
    printCount: int("print_count", { unsigned: true }).notNull().default(0),
    printedBy: fk("printed_by"),
    printedAt: datetime("printed_at", { mode: "date" }),
    createdBy: fk("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_invoices_no").on(t.invoiceNo),
    uniqueIndex("uq_invoices_booking").on(t.bookingId),
    index("idx_invoices_branch_date").on(t.branchId, t.invoiceDate),
    index("idx_invoices_customer").on(t.customerId),
    index("idx_invoices_status").on(t.status),
  ],
);

// ---------------------------------------------------------------------------
// 11. settings
// ---------------------------------------------------------------------------
export const settings = mysqlTable("settings", {
  settingKey: varchar("setting_key", { length: 60 }).primaryKey(),
  value: varchar("value", { length: 255 }).notNull(),
  updatedBy: fk("updated_by"),
  updatedAt: datetime("updated_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`).$onUpdate(() => new Date()),
});

// ---------------------------------------------------------------------------
// 12. sequences
// ---------------------------------------------------------------------------
export const sequences = mysqlTable(
  "sequences",
  {
    name: varchar("name", { length: 30 }).notNull(),
    year: smallint("year", { unsigned: true }).notNull().default(0),
    lastValue: int("last_value", { unsigned: true }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.name, t.year] })],
);

// Row types for use across the app
export type User = typeof users.$inferSelect;
export type Branch = typeof branches.$inferSelect;
export type Employee = typeof employees.$inferSelect;
export type Hospital = typeof hospitals.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Patient = typeof patients.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
