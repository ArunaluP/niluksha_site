import "server-only";
import { and, asc, count, desc, eq, gte, inArray, like, lte, or, type SQL } from "drizzle-orm";
import * as z from "zod";
import { db } from "@/db";
import {
  BOOKING_STATUSES,
  bookings,
  bookingStatusLogs,
  branches,
  customers,
  employees,
  hospitals,
  invoices,
  patients,
  users,
  type Booking,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/dal";
import { addDays, today } from "@/lib/dates";
import { AppError, ValidationError, ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { branchScope, canAccessBranch } from "@/lib/permissions";
import { nextNumber } from "@/lib/sequences";
import { id, isoDate, nullableBedNo, nullableText, nullableWardNo, optBedNo, optText, optWardNo, pageParams, pagination, time, type Paged } from "@/lib/validation";
import { assertEmployeeCanWork, listAvailableEmployees } from "../employees/service";
import { packageForBooking } from "../packages/service";
import { applyTransition, lockBooking } from "./status";

// ======================================================================= schemas
const locationFields = {
  locationType: z.enum(["home", "hospital"], { error: "Location must be home or hospital." }),
  hospitalId: id.nullable().optional(),
  wardNo: optWardNo,
  bedNo: optBedNo,
  serviceAddress: optText(255),
};

export const BookingCreateSchema = z
  .object({
    customerId: id,
    patientId: id,
    serviceDate: isoDate,
    startTime: time.optional(),
    /** Leave out to use the default package. */
    packageId: id.optional(),
    ...locationFields,
    notes: optText(2000),
  })
  .refine((b) => b.locationType !== "hospital" || b.hospitalId, {
    error: "Select a hospital for a hospital booking.",
    path: ["hospitalId"],
  });

export const BookingUpdateSchema = z.object({
  patientId: id.optional(),
  serviceDate: isoDate.optional(),
  startTime: time.optional(),
  packageId: id.optional(),
  locationType: locationFields.locationType.optional(),
  hospitalId: id.nullable().optional(),
  wardNo: nullableWardNo,
  bedNo: nullableBedNo,
  serviceAddress: nullableText(255),
  notes: nullableText(2000),
});

const statusList = z
  .string()
  .transform((s) => s.split(",").map((x) => x.trim()))
  .pipe(z.array(z.enum(BOOKING_STATUSES)));

export const BookingListQuery = z.object({
  date: isoDate.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  status: statusList.optional(), // e.g. status=pending,confirmed
  customerId: id.optional(),
  employeeId: id.optional(),
  branchId: id.optional(),
  q: optText(100), // booking no, customer name or phone, patient name
  ...pagination,
});

export const CallListQuery = z.object({
  day: z.enum(["today", "tomorrow"]).optional(),
  date: isoDate.optional(), // overrides day
  view: z.enum(["pending", "done", "all"]).default("pending"),
});

export const NoteSchema = z.object({ note: optText(255) });
export const AssignSchema = z.object({ employeeId: id, note: optText(255) });

// ======================================================================= reads
const listColumns = {
  id: bookings.id,
  bookingNo: bookings.bookingNo,
  serviceDate: bookings.serviceDate,
  startTime: bookings.startTime,
  packageId: bookings.packageId,
  packageName: bookings.packageName,
  durationHours: bookings.durationHours,
  status: bookings.status,
  rate: bookings.rate,
  locationType: bookings.locationType,
  hospitalId: bookings.hospitalId,
  hospitalName: hospitals.name,
  hospitalType: hospitals.type,
  wardNo: bookings.wardNo,
  bedNo: bookings.bedNo,
  serviceAddress: bookings.serviceAddress,
  customerId: bookings.customerId,
  customerNo: customers.customerNo,
  customerName: customers.fullName,
  customerPhone: customers.phone,
  customerAltPhone: customers.altPhone,
  patientId: bookings.patientId,
  patientName: patients.fullName,
  employeeId: bookings.employeeId,
  employeeName: employees.fullName,
  employeePhone: employees.phone,
  branchId: bookings.branchId,
  branchName: branches.name,
  notes: bookings.notes,
  createdAt: bookings.createdAt,
};

function baseBookingQuery() {
  return db
    .select(listColumns)
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(patients, eq(patients.id, bookings.patientId))
    .leftJoin(hospitals, eq(hospitals.id, bookings.hospitalId))
    .leftJoin(employees, eq(employees.id, bookings.employeeId))
    .leftJoin(branches, eq(branches.id, bookings.branchId))
    .$dynamic();
}

export async function listBookings(q: z.infer<typeof BookingListQuery>, user: CurrentUser): Promise<Paged<unknown>> {
  const where: (SQL | undefined)[] = [branchScope(user, bookings.branchId)];
  if (q.date) where.push(eq(bookings.serviceDate, q.date));
  if (q.from) where.push(gte(bookings.serviceDate, q.from));
  if (q.to) where.push(lte(bookings.serviceDate, q.to));
  if (q.status?.length) where.push(inArray(bookings.status, q.status));
  if (q.customerId) where.push(eq(bookings.customerId, q.customerId));
  if (q.employeeId) where.push(eq(bookings.employeeId, q.employeeId));
  if (q.branchId) where.push(eq(bookings.branchId, q.branchId));
  if (q.q) {
    const s = `%${q.q}%`;
    where.push(
      or(like(bookings.bookingNo, s), like(customers.fullName, s), like(customers.phone, s), like(patients.fullName, s)),
    );
  }
  const { limit, offset } = pageParams(q);
  const [items, [{ total }]] = await Promise.all([
    baseBookingQuery()
      .where(and(...where))
      .orderBy(desc(bookings.serviceDate), asc(bookings.startTime), desc(bookings.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(bookings)
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .innerJoin(patients, eq(patients.id, bookings.patientId))
      .where(and(...where)),
  ]);
  return { items, total, page: q.page, pageSize: q.pageSize };
}

/** Full booking: details, status history and invoice (if delivered). */
export async function getBooking(bookingId: number, user: CurrentUser) {
  const [row] = await baseBookingQuery().where(eq(bookings.id, bookingId));
  if (!row || !canAccessBranch(user, row.branchId)) throw new NotFoundError("Booking");

  const [history, [invoice]] = await Promise.all([
    db
      .select({
        id: bookingStatusLogs.id,
        fromStatus: bookingStatusLogs.fromStatus,
        toStatus: bookingStatusLogs.toStatus,
        note: bookingStatusLogs.note,
        userName: users.name,
        createdAt: bookingStatusLogs.createdAt,
      })
      .from(bookingStatusLogs)
      .innerJoin(users, eq(users.id, bookingStatusLogs.userId))
      .where(eq(bookingStatusLogs.bookingId, bookingId))
      .orderBy(asc(bookingStatusLogs.id)),
    db
      .select({ id: invoices.id, invoiceNo: invoices.invoiceNo, amount: invoices.amount, status: invoices.status })
      .from(invoices)
      .where(eq(invoices.bookingId, bookingId)),
  ]);
  return { ...row, history, invoice: invoice ?? null };
}

/** Same as getBooking, found by booking number ("BK-2026-00018"). Other branches → 404. */
export async function getBookingByNo(bookingNo: string, user: CurrentUser) {
  const [row] = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.bookingNo, bookingNo.toUpperCase()));
  if (!row) throw new NotFoundError("Booking");
  return getBooking(row.id, user);
}

/**
 * The call center's daily list. view=pending: still to call;
 * view=done: already confirmed/ignored/assigned/...; view=all: everything that day.
 */
export async function getCallList(q: z.infer<typeof CallListQuery>) {
  const date = q.date ?? (q.day === "tomorrow" ? addDays(today(), 1) : today());
  const statusFilter =
    q.view === "pending" ? eq(bookings.status, "pending") : q.view === "done" ? inArray(bookings.status, BOOKING_STATUSES.filter((s) => s !== "pending")) : undefined;

  const [items, summary] = await Promise.all([
    baseBookingQuery()
      .where(and(eq(bookings.serviceDate, date), statusFilter))
      .orderBy(asc(bookings.startTime), asc(bookings.id)),
    db
      .select({ status: bookings.status, total: count() })
      .from(bookings)
      .where(eq(bookings.serviceDate, date))
      .groupBy(bookings.status),
  ]);
  const counts = Object.fromEntries(BOOKING_STATUSES.map((s) => [s, 0])) as Record<string, number>;
  for (const r of summary) counts[r.status] = r.total;
  return { date, view: q.view, counts, items };
}

// ======================================================================= create / update
async function checkLocation(
  input: { locationType?: "home" | "hospital"; hospitalId?: number | null; serviceAddress?: string | null },
  fallbackAddress: string | null,
) {
  if (input.locationType === "hospital") {
    if (!input.hospitalId) throw new AppError("Select a hospital for a hospital booking.");
    const [h] = await db.select({ isActive: hospitals.isActive }).from(hospitals).where(eq(hospitals.id, input.hospitalId));
    if (!h) throw new AppError("Hospital not found.");
    if (!h.isActive) throw new AppError("This hospital is inactive.");
    return { hospitalId: input.hospitalId, serviceAddress: input.serviceAddress ?? null };
  }
  // Home care: use the given address, else the patient's / customer's address.
  const address = input.serviceAddress || fallbackAddress;
  if (!address) throw new AppError("Enter the service address for home care (the patient has no saved address).");
  return { hospitalId: null, serviceAddress: address };
}

/** Name, hours and price are copied from the package onto the booking. */
function fromPackage(p: { id: number; name: string; durationHours: number; price: string }) {
  return { packageId: p.id, packageName: p.name, durationHours: p.durationHours, rate: p.price };
}

/** Hospital: ward no required, bed no optional. Home care: both cleared. */
function hospitalBed(locationType: "home" | "hospital", wardNo?: string | null, bedNo?: string | null) {
  if (locationType !== "hospital") return { wardNo: null, bedNo: null };
  if (!wardNo) throw new ValidationError({ wardNo: ["Ward no is required for a hospital booking."] });
  return { wardNo, bedNo: bedNo ?? null };
}

function checkDate(date: string) {
  if (date < today()) throw new AppError(`The service date can't be in the past (today is ${today()}).`);
}

async function getPatientOfCustomer(patientId: number, customerId: number) {
  const [p] = await db
    .select({ id: patients.id, address: patients.address, customerAddress: customers.address, customerId: patients.customerId })
    .from(patients)
    .innerJoin(customers, eq(customers.id, patients.customerId))
    .where(eq(patients.id, patientId));
  if (!p) throw new AppError("Patient not found.");
  if (p.customerId !== customerId) throw new AppError("This patient is not registered under the selected customer.");
  return p;
}

export async function createBooking(input: z.infer<typeof BookingCreateSchema>, user: CurrentUser) {
  checkDate(input.serviceDate);
  const [customer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, input.customerId));
  if (!customer) throw new AppError("Customer not found.");
  const patient = await getPatientOfCustomer(input.patientId, input.customerId);
  const location = await checkLocation(input, patient.address ?? patient.customerAddress);
  const pkg = await packageForBooking(input.packageId);

  const bookingId = await db.transaction(async (tx) => {
    const bookingNo = await nextNumber(tx, "booking");
    const [res] = await tx.insert(bookings).values({
      bookingNo,
      customerId: input.customerId,
      patientId: input.patientId,
      serviceDate: input.serviceDate,
      startTime: input.startTime ?? "08:00:00",
      locationType: input.locationType,
      ...hospitalBed(input.locationType, input.wardNo, input.bedNo),
      ...location,
      ...fromPackage(pkg),
      notes: input.notes ?? null,
      createdBy: user.id,
    });
    await tx.insert(bookingStatusLogs).values({ bookingId: res.insertId, fromStatus: null, toStatus: "pending", userId: user.id });
    return res.insertId;
  });
  return getBooking(bookingId, user);
}

/** Change date/time/location/patient — only before an employee is assigned. */
export async function updateBooking(bookingId: number, input: z.infer<typeof BookingUpdateSchema>, user: CurrentUser) {
  const [current] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!current) throw new NotFoundError("Booking");
  if (current.status !== "pending" && current.status !== "confirmed") {
    throw new ConflictError(`Booking ${current.bookingNo} is ${current.status}; details can only be changed while pending or confirmed.`);
  }
  if (input.serviceDate) checkDate(input.serviceDate);

  const patientId = input.patientId ?? current.patientId;
  const patient = await getPatientOfCustomer(patientId, current.customerId);

  const set: Partial<typeof bookings.$inferInsert> = {};
  if (input.patientId) set.patientId = input.patientId;
  if (input.serviceDate) set.serviceDate = input.serviceDate;
  if (input.startTime) set.startTime = input.startTime;
  if (input.notes !== undefined) set.notes = input.notes;
  if (input.packageId && input.packageId !== current.packageId) Object.assign(set, fromPackage(await packageForBooking(input.packageId)));

  const touchesLocation =
    input.locationType !== undefined || input.hospitalId !== undefined || input.serviceAddress !== undefined || input.wardNo !== undefined || input.bedNo !== undefined;
  if (touchesLocation) {
    const locationType = input.locationType ?? current.locationType;
    const loc = await checkLocation(
      {
        locationType,
        hospitalId: input.hospitalId !== undefined ? input.hospitalId : current.hospitalId,
        serviceAddress: input.serviceAddress !== undefined ? input.serviceAddress : current.serviceAddress,
      },
      patient.address ?? patient.customerAddress,
    );
    Object.assign(set, loc, {
      locationType,
      ...hospitalBed(
        locationType,
        input.wardNo !== undefined ? input.wardNo : current.wardNo,
        input.bedNo !== undefined ? input.bedNo : current.bedNo,
      ),
    });
  }
  if (Object.keys(set).length) await db.update(bookings).set(set).where(eq(bookings.id, bookingId));
  return getBooking(bookingId, user);
}

// ======================================================================= workflow actions
export async function confirmBooking(bookingId: number, user: CurrentUser, note?: string) {
  await db.transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    await applyTransition(tx, b, "confirm", user, { confirmedBy: user.id, confirmedAt: new Date() }, note);
  });
  return getBooking(bookingId, user);
}

/** Customer declined (on the call, or a late cancellation). Frees any assigned employee. */
export async function ignoreBooking(bookingId: number, user: CurrentUser, note?: string) {
  await db.transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    await applyTransition(
      tx,
      b,
      "ignore",
      user,
      { ignoredBy: user.id, ignoredAt: new Date(), employeeId: null, branchId: null },
      note ?? (b.status === "assigned" ? "Cancelled after assignment; employee released" : undefined),
    );
  });
  return getBooking(bookingId, user);
}

export async function getAvailableForBooking(bookingId: number) {
  const [b] = await db
    .select({ serviceDate: bookings.serviceDate, status: bookings.status, employeeId: bookings.employeeId })
    .from(bookings)
    .where(eq(bookings.id, bookingId));
  if (!b) throw new NotFoundError("Booking");
  const employeesFree = await listAvailableEmployees(b.serviceDate);
  return { date: b.serviceDate, bookingStatus: b.status, currentEmployeeId: b.employeeId, employees: employeesFree };
}

/** Assign (from confirmed) or reassign (from assigned) to an employee of any branch. */
export async function assignEmployee(bookingId: number, employeeId: number, user: CurrentUser, note?: string) {
  await db.transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    if (b.status === "assigned" && b.employeeId === employeeId) {
      throw new ConflictError("The booking is already assigned to this employee.");
    }
    const emp = await assertEmployeeCanWork(employeeId, b.serviceDate);
    let autoNote = note;
    if (!autoNote && b.status === "assigned" && b.employeeId) {
      const [prev] = await tx.select({ name: employees.fullName }).from(employees).where(eq(employees.id, b.employeeId));
      autoNote = `Reassigned from ${prev?.name ?? "previous employee"} to ${emp.fullName}`;
    }
    // The UNIQUE (busy_employee_id, service_date) index rejects double bookings → 409.
    await applyTransition(
      tx,
      b,
      "assign",
      user,
      { employeeId, branchId: emp.branchId, assignedBy: user.id, assignedAt: new Date() },
      autoNote,
    );
  });
  return getBooking(bookingId, user);
}

export async function unassignEmployee(bookingId: number, user: CurrentUser, note?: string) {
  await db.transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    await applyTransition(tx, b, "unassign", user, { employeeId: null, branchId: null, assignedBy: null, assignedAt: null }, note);
  });
  return getBooking(bookingId, user);
}

function assertBranchAccess(user: CurrentUser, b: Booking) {
  if (!canAccessBranch(user, b.branchId)) throw new ForbiddenError("This booking belongs to another branch.");
}

/** Session done → status delivered + invoice created automatically (same transaction). */
export async function deliverBooking(bookingId: number, user: CurrentUser, note?: string) {
  const invoiceId = await db.transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    assertBranchAccess(user, b);
    if (b.serviceDate > today()) {
      throw new AppError(`Booking ${b.bookingNo} is for ${b.serviceDate}; it can be marked delivered on or after that date.`);
    }
    await applyTransition(tx, b, "deliver", user, { deliveredBy: user.id, deliveredAt: new Date() }, note);

    const invoiceNo = await nextNumber(tx, "invoice");
    const qty = 1;
    const amount = (Number(b.rate) * qty).toFixed(2);
    const [res] = await tx.insert(invoices).values({
      invoiceNo,
      bookingId: b.id,
      customerId: b.customerId,
      branchId: b.branchId!, // set on assignment
      invoiceDate: today(),
      rate: b.rate,
      qty: qty.toFixed(2),
      amount,
      createdBy: user.id,
    });
    return res.insertId;
  });
  const booking = await getBooking(bookingId, user);
  return { booking, invoiceId };
}
