import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, bookingStatusLogs, branches, customers, employees, hospitals, invoices, patients, users, type BookingStatus } from "@/db/schema";
import type { CurrentUser } from "@/lib/dal";
import { NotFoundError } from "@/lib/errors";
import { canAccessBranch } from "@/lib/permissions";
import { classifyEvent, EVENT_LABELS, type EventKey } from "../reports/events";

/**
 * A booking's whole journey: booked → confirmed → assigned → delivered → invoice printed,
 * with who did each step, how long it took, and every detour (ignore / reassign / unassign).
 * Used by the full booking page and by GET /api/bookings/:id/journey (Reports side panel).
 * Event meaning comes from reports/events.ts, so the journey and the report always agree.
 */

export const MILESTONE_KEYS = ["booked", "confirmed", "assigned", "delivered", "invoice_printed"] as const;
export type MilestoneKey = (typeof MILESTONE_KEYS)[number];
export type MilestoneState = "done" | "current" | "upcoming" | "skipped";

const MILESTONE_LABELS: Record<MilestoneKey, string> = {
  booked: "Booked",
  confirmed: "Confirmed",
  assigned: "Assigned",
  delivered: "Delivered",
  invoice_printed: "Invoice printed",
};

/** Dates are ISO strings so the same shape works in server pages and as JSON. */
export type Milestone = {
  key: MilestoneKey;
  label: string;
  state: MilestoneState;
  at: string | null;
  byUser: string | null;
  /** Minutes since the previous done milestone (null if either isn't done). */
  sincePrevious: number | null;
};

export type JourneyEmployee = { name: string; empNo: string; branchName: string | null };

export type JourneyEvent = {
  id: number;
  kind: EventKey | null;
  label: string;
  at: string;
  byUser: string;
  note: string | null;
  /** assigned / reassigned: who was assigned; unassigned: who was removed. Null = not recorded. */
  employee: JourneyEmployee | null;
  /** reassigned only: the employee before. */
  previousEmployee?: JourneyEmployee | null;
};

export type BookingJourney = Awaited<ReturnType<typeof getBookingJourney>>;

const BOOKING_NO = /^BK-\d{4}-\d{5}$/i;

/** MySQL DATETIME text is Sri Lanka wall time (see reports/service.ts) → ISO string. */
function lkIso(v: string | Date): string {
  const d = v instanceof Date ? v : new Date(`${String(v).replace(" ", "T")}+05:30`);
  return d.toISOString();
}

const minutesBetween = (a: string | null, b: string | null) => (a && b ? Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 60_000)) : null);

/** ref = numeric id ("12") or booking number ("BK-2026-00018"). Other branches → 404. */
export async function getBookingJourney(ref: string, user: CurrentUser) {
  const where = /^\d+$/.test(ref) ? eq(bookings.id, Number(ref)) : BOOKING_NO.test(ref) ? eq(bookings.bookingNo, ref.toUpperCase()) : null;
  if (!where) throw new NotFoundError("Booking");

  const [row] = await db
    .select({
      id: bookings.id,
      bookingNo: bookings.bookingNo,
      status: bookings.status,
      serviceDate: bookings.serviceDate,
      startTime: bookings.startTime,
      durationHours: bookings.durationHours,
      packageName: bookings.packageName,
      rate: bookings.rate,
      locationType: bookings.locationType,
      hospitalName: hospitals.name,
      wardNo: bookings.wardNo,
      bedNo: bookings.bedNo,
      serviceAddress: bookings.serviceAddress,
      notes: bookings.notes,
      createdAt: sql<string>`${bookings.createdAt}`,
      branchId: bookings.branchId,
      customerId: customers.id,
      customerNo: customers.customerNo,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      patientId: patients.id,
      patientNo: patients.patientNo,
      patientName: patients.fullName,
      gender: patients.gender,
      relationship: patients.relationship,
      relationshipOther: patients.relationshipOther,
      employeeName: employees.fullName,
      empNo: employees.empNo,
      designation: employees.designation,
      branchName: branches.name,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(patients, eq(patients.id, bookings.patientId))
    .leftJoin(hospitals, eq(hospitals.id, bookings.hospitalId))
    .leftJoin(employees, eq(employees.id, bookings.employeeId))
    .leftJoin(branches, eq(branches.id, bookings.branchId))
    .where(where);
  if (!row || !canAccessBranch(user, row.branchId)) throw new NotFoundError("Booking");

  const [logs, [inv]] = await Promise.all([
    db
      .select({
        id: bookingStatusLogs.id,
        at: sql<string>`${bookingStatusLogs.createdAt}`,
        fromStatus: bookingStatusLogs.fromStatus,
        toStatus: bookingStatusLogs.toStatus,
        note: bookingStatusLogs.note,
        byUser: users.name,
        employeeName: employees.fullName,
        empNo: employees.empNo,
        employeeBranch: branches.name,
      })
      .from(bookingStatusLogs)
      .innerJoin(users, eq(users.id, bookingStatusLogs.userId))
      .leftJoin(employees, eq(employees.id, bookingStatusLogs.employeeId))
      .leftJoin(branches, eq(branches.id, employees.branchId))
      .where(eq(bookingStatusLogs.bookingId, row.id))
      .orderBy(asc(bookingStatusLogs.id)),
    db
      .select({
        id: invoices.id,
        invoiceNo: invoices.invoiceNo,
        amount: invoices.amount,
        status: invoices.status,
        printCount: invoices.printCount,
        printedAt: sql<string | null>`${invoices.printedAt}`,
      })
      .from(invoices)
      .where(eq(invoices.bookingId, row.id)),
  ]);

  // ---------------------------------------------------------------- events
  const events: JourneyEvent[] = [];
  let lastAssigned: JourneyEmployee | null = null;
  for (const l of logs) {
    const kind = classifyEvent(l.fromStatus, l.toStatus);
    const logged: JourneyEmployee | null = l.employeeName ? { name: l.employeeName, empNo: l.empNo!, branchName: l.employeeBranch } : null;
    const e: JourneyEvent = {
      id: l.id,
      kind,
      label: kind ? EVENT_LABELS[kind] : `${l.fromStatus ?? "—"} → ${l.toStatus}`,
      at: lkIso(l.at),
      byUser: l.byUser,
      note: l.note,
      employee: null,
    };
    if (kind === "assigned" || kind === "reassigned") {
      e.employee = logged;
      if (kind === "reassigned") e.previousEmployee = lastAssigned;
      lastAssigned = logged;
    } else if (kind === "unassigned") {
      e.employee = lastAssigned;
      lastAssigned = null;
    }
    events.push(e);
  }

  // ---------------------------------------------------------------- milestones
  type Reached = { at: string; byUser: string } | null;
  const reached: Record<MilestoneKey, Reached> = { booked: null, confirmed: null, assigned: null, delivered: null, invoice_printed: null };
  const first = (k: MilestoneKey, e: JourneyEvent) => (reached[k] ??= { at: e.at, byUser: e.byUser });
  let ignoredEvent: JourneyEvent | null = null;
  for (const e of events) {
    if (e.kind === "created") first("booked", e);
    else if (e.kind === "confirmed") first("confirmed", e);
    // "Assigned" = the start of the assignment still in effect: a reassignment keeps it,
    // an unassign clears it until the next assign.
    else if (e.kind === "assigned") first("assigned", e);
    else if (e.kind === "unassigned") reached.assigned = null;
    else if (e.kind === "delivered") first("delivered", e);
    else if (e.kind === "invoice_printed") first("invoice_printed", e);
    else if (e.kind === "ignored") ignoredEvent = e;
  }
  const isIgnored = row.status === "ignored";

  let currentGiven = false;
  let prevDoneAt: string | null = null;
  const milestones: Milestone[] = MILESTONE_KEYS.map((key) => {
    const r = reached[key];
    let state: MilestoneState;
    if (r) state = "done";
    else if (isIgnored) state = "skipped";
    else if (!currentGiven) {
      state = "current";
      currentGiven = true;
    } else state = "upcoming";
    const sincePrevious = state === "done" ? minutesBetween(prevDoneAt, r!.at) : null;
    if (state === "done") prevDoneAt = r!.at;
    return { key, label: MILESTONE_LABELS[key], state, at: r?.at ?? null, byUser: r?.byUser ?? null, sincePrevious };
  });

  const at = (k: MilestoneKey) => reached[k]?.at ?? null;
  const ig = isIgnored ? (ignoredEvent as JourneyEvent | null) : null;

  return {
    /** When this was read ("3 h ago" is relative to it). */
    asOf: new Date().toISOString(),
    booking: {
      id: row.id,
      bookingNo: row.bookingNo,
      status: row.status as BookingStatus,
      serviceDate: row.serviceDate,
      startTime: row.startTime,
      durationHours: row.durationHours,
      packageName: row.packageName,
      rate: row.rate,
      locationType: row.locationType,
      hospitalName: row.hospitalName,
      wardNo: row.wardNo,
      bedNo: row.bedNo,
      serviceAddress: row.serviceAddress,
      notes: row.notes,
      createdAt: lkIso(row.createdAt),
    },
    customer: { id: row.customerId, customerNo: row.customerNo, fullName: row.customerName, phone: row.customerPhone },
    patient: {
      id: row.patientId,
      patientNo: row.patientNo,
      fullName: row.patientName,
      gender: row.gender,
      relationship: row.relationship,
      relationshipOther: row.relationshipOther,
    },
    assignment: row.employeeName ? { employeeName: row.employeeName, empNo: row.empNo!, designation: row.designation!, branchName: row.branchName } : null,
    invoice: inv ? { ...inv, printedAt: inv.printedAt ? lkIso(inv.printedAt) : null } : null,
    milestones,
    /** Set when the booking is ignored: the red stop after the last done milestone. */
    ignored: ig ? { at: ig.at, byUser: ig.byUser, note: ig.note } : null,
    events,
    stats: {
      toConfirm: minutesBetween(at("booked"), at("confirmed")),
      toAssign: minutesBetween(at("confirmed"), at("assigned")),
      toDeliver: minutesBetween(at("assigned"), at("delivered")),
      bookingToDelivery: minutesBetween(at("booked"), at("delivered")),
    },
  };
}
