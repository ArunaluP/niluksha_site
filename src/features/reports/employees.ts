import "server-only";
import { and, asc, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import * as z from "zod";
import { db } from "@/db";
import { bookings, branches, customers, employees, hospitals, invoices, patients } from "@/db/schema";
import type { CurrentUser } from "@/lib/dal";
import { addDays, today } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { branchScope } from "@/lib/permissions";
import { id, isoDate, pagination } from "@/lib/validation";
import { daysBetween, periodLabel } from "./events";
import { MAX_REPORT_DAYS } from "./service";

/**
 * Employee report: who completed the most sessions in a period.
 *
 * "Completed" = the booking reached invoice_printed (the end of the flow).
 * Each DAY of a booking is one session, counted on the day it was worked:
 * a 5-day booking = 5 sessions, and only its days inside the period count
 * (hours and value too: days in the period x hours / price per day).
 * Ranking: most completed sessions first; a tie goes to whoever worked
 * most recently; then by name.
 *
 * Who sees what (same rule as the other reports):
 *   Director / call center → all branches (Director may pick one branch)
 *   Branch manager         → only sessions of their own branch
 * The branch of a session is bookings.branch_id (copied from the employee
 * when they were assigned), so moving an employee later doesn't move history.
 */

// ======================================================================= query
export const EmployeeReportQuery = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    branchId: id.optional(), // Director only
    page: pagination.page,
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .transform((q, ctx) => {
    const t = today();
    const to = q.to ?? t;
    const from = q.from ?? `${to.slice(0, 8)}01`; // default: this month so far
    if (from > t || to > t) {
      ctx.addIssue({ code: "custom", path: [to > t ? "to" : "from"], message: `Dates can't be in the future (today is ${t}).` });
      return z.NEVER;
    }
    if (from > to) {
      ctx.addIssue({ code: "custom", path: ["from"], message: "The start date must be on or before the end date." });
      return z.NEVER;
    }
    if (daysBetween(from, to) + 1 > MAX_REPORT_DAYS) {
      ctx.addIssue({ code: "custom", path: ["to"], message: `The period can be at most ${MAX_REPORT_DAYS} days.` });
      return z.NEVER;
    }
    return { ...q, from, to };
  });

export type EmployeeReportQueryInput = z.infer<typeof EmployeeReportQuery>;

/** Completed bookings with at least one day in the period that this user may see. */
function completedWhere(user: CurrentUser, q: EmployeeReportQueryInput, extra?: SQL): SQL {
  const branchId = user.role === "admin" ? q.branchId : undefined;
  return and(
    eq(bookings.status, "invoice_printed"),
    lte(bookings.serviceDate, q.to),
    gte(bookings.endDate, q.from),
    branchScope(user, bookings.branchId),
    branchId ? eq(bookings.branchId, branchId) : undefined,
    extra,
  )!;
}

/** Days of the booking inside the period: from max(start, from) to min(end, to). */
const daysIn = (q: EmployeeReportQueryInput) =>
  sql`(DATEDIFF(LEAST(${bookings.endDate}, ${q.to}), GREATEST(${bookings.serviceDate}, ${q.from})) + 1)`;

/** Every day of these bookings that falls in the period, counted per day (for the charts). */
function perDayCounts(rows: { serviceDate: string; days: number }[], q: EmployeeReportQueryInput) {
  const perDay = new Map<string, number>();
  for (const r of rows) {
    const start = String(r.serviceDate).slice(0, 10);
    for (let i = 0; i < r.days; i++) {
      const d = addDays(start, i);
      if (d >= q.from && d <= q.to) perDay.set(d, (perDay.get(d) ?? 0) + 1);
    }
  }
  return perDay;
}

// ======================================================================= ranking
export async function getEmployeeRanking(user: CurrentUser, q: EmployeeReportQueryInput, opts: { all?: boolean } = {}) {
  const where = completedWhere(user, q);
  const sessions = sql<number>`COALESCE(SUM(${daysIn(q)}), 0)`.mapWith(Number);
  const lastWorked = sql<string>`MAX(LEAST(${bookings.endDate}, ${q.to}))`;

  const rows = await db
    .select({
      employeeId: employees.id,
      empNo: employees.empNo,
      fullName: employees.fullName,
      designation: employees.designation,
      status: employees.status,
      branchName: sql<string>`MIN(${branches.name})`, // branch of the sessions (one per employee in practice)
      sessions,
      daysWorked: sessions, // one booking per caregiver per day, so days worked = sessions
      hours: sql<number>`COALESCE(SUM(${daysIn(q)} * ${bookings.durationHours}), 0)`.mapWith(Number),
      value: sql<string>`COALESCE(SUM(${daysIn(q)} * ${bookings.rate}), 0)`,
      lastWorked,
    })
    .from(bookings)
    .innerJoin(employees, eq(employees.id, bookings.employeeId))
    .leftJoin(branches, eq(branches.id, bookings.branchId))
    .where(where)
    .groupBy(employees.id, employees.empNo, employees.fullName, employees.designation, employees.status)
    .orderBy(desc(sessions), desc(lastWorked), asc(employees.fullName));

  // Finished sessions per day (all employees in the list) for the chart.
  const spans = await db.select({ serviceDate: bookings.serviceDate, days: bookings.days }).from(bookings).where(where);
  const perDay = perDayCounts(spans, q);

  const totals = rows.reduce(
    (t, r) => ({ sessions: t.sessions + r.sessions, hours: t.hours + r.hours, value: t.value + Number(r.value) }),
    { sessions: 0, hours: 0, value: 0 },
  );

  // Rank: same number of sessions AND same last day = same rank (1, 2, 2, 4 …)
  let rank = 0;
  const ranked = rows.map((r, i) => {
    const prev = rows[i - 1];
    if (!prev || prev.sessions !== r.sessions || String(prev.lastWorked) !== String(r.lastWorked)) rank = i + 1;
    return { ...r, lastWorked: String(r.lastWorked).slice(0, 10), rank };
  });

  const start = opts.all ? 0 : (q.page - 1) * q.pageSize;
  const size = opts.all ? ranked.length : q.pageSize;
  return {
    period: { from: q.from, to: q.to, label: periodLabel(q.from, q.to) },
    totals: { ...totals, employees: rows.length, value: totals.value.toFixed(2) },
    chart: { unit: daysBetween(q.from, q.to) + 1 <= 62 ? ("day" as const) : ("week" as const), bars: buckets(q.from, q.to, perDay) },
    items: ranked.slice(start, start + size),
    total: ranked.length,
    page: opts.all ? 1 : q.page,
    pageSize: size,
  };
}

export type EmployeeRanking = Awaited<ReturnType<typeof getEmployeeRanking>>;

// ======================================================================= one employee
/** Daily (≤ 62 days) or weekly (Monday-based) buckets for the bar chart, zero-filled. */
function buckets(from: string, to: string, perDay: Map<string, number>) {
  const days = daysBetween(from, to) + 1;
  if (days <= 62) {
    return Array.from({ length: days }, (_, i) => {
      const d = addDays(from, i);
      return { key: d, from: d, to: d, count: perDay.get(d) ?? 0 };
    });
  }
  const out: { key: string; from: string; to: string; count: number }[] = [];
  const [y, m, dd] = from.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
  let start = addDays(from, -((dow + 6) % 7)); // Monday of the first week
  while (start <= to) {
    const end = addDays(start, 6);
    let count = 0;
    for (let i = 0; i < 7; i++) count += perDay.get(addDays(start, i)) ?? 0;
    out.push({ key: start, from: start < from ? from : start, to: end > to ? to : end, count });
    start = addDays(start, 7);
  }
  return out;
}

export async function getEmployeeSessions(user: CurrentUser, empNo: string, q: EmployeeReportQueryInput) {
  const [emp] = await db
    .select({
      id: employees.id,
      empNo: employees.empNo,
      fullName: employees.fullName,
      designation: employees.designation,
      status: employees.status,
      phone: employees.phone,
      branchId: employees.branchId,
      branchName: branches.name,
    })
    .from(employees)
    .innerJoin(branches, eq(branches.id, employees.branchId))
    .where(eq(employees.empNo, empNo));
  if (!emp) throw new NotFoundError("Employee");

  const where = completedWhere(user, q, eq(bookings.employeeId, emp.id));
  const sessions = await db
    .select({
      id: bookings.id,
      bookingNo: bookings.bookingNo,
      serviceDate: bookings.serviceDate,
      days: bookings.days,
      endDate: bookings.endDate,
      daysInPeriod: sql<number>`${daysIn(q)}`.mapWith(Number),
      startTime: bookings.startTime,
      packageName: bookings.packageName,
      durationHours: bookings.durationHours,
      rate: bookings.rate,
      locationType: bookings.locationType,
      hospitalName: hospitals.name,
      wardNo: bookings.wardNo,
      bedNo: bookings.bedNo,
      serviceAddress: bookings.serviceAddress,
      branchName: branches.name,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      patientName: patients.fullName,
      invoiceId: invoices.id,
      invoiceNo: invoices.invoiceNo,
      printedAt: invoices.printedAt,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(patients, eq(patients.id, bookings.patientId))
    .leftJoin(hospitals, eq(hospitals.id, bookings.hospitalId))
    .leftJoin(branches, eq(branches.id, bookings.branchId))
    .leftJoin(invoices, eq(invoices.bookingId, bookings.id))
    .where(where)
    .orderBy(desc(bookings.serviceDate), desc(bookings.startTime));

  // A branch manager may only open employees of their own branch (unless they have sessions there).
  if (user.role === "branch_manager" && emp.branchId !== user.branchId && sessions.length === 0) {
    throw new NotFoundError("Employee");
  }

  const perDay = perDayCounts(sessions, q);
  const chart = buckets(q.from, q.to, perDay);

  return {
    employee: emp,
    period: { from: q.from, to: q.to, label: periodLabel(q.from, q.to) },
    totals: {
      sessions: sessions.reduce((t, s) => t + s.daysInPeriod, 0),
      bookings: sessions.length,
      daysWorked: perDay.size,
      hours: sessions.reduce((t, s) => t + s.daysInPeriod * s.durationHours, 0),
      value: sessions.reduce((t, s) => t + s.daysInPeriod * Number(s.rate), 0).toFixed(2),
    },
    chart: { unit: daysBetween(q.from, q.to) + 1 <= 62 ? ("day" as const) : ("week" as const), bars: chart },
    sessions,
  };
}

export type EmployeeSessions = Awaited<ReturnType<typeof getEmployeeSessions>>;

/** Every finished session in the period (all employees in scope), newest first — for Excel. */
export async function listFinishedSessions(user: CurrentUser, q: EmployeeReportQueryInput) {
  return db
    .select({
      serviceDate: bookings.serviceDate,
      days: bookings.days,
      endDate: bookings.endDate,
      daysInPeriod: sql<number>`${daysIn(q)}`.mapWith(Number),
      startTime: bookings.startTime,
      bookingNo: bookings.bookingNo,
      empNo: employees.empNo,
      employeeName: employees.fullName,
      designation: employees.designation,
      branchName: branches.name,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      patientName: patients.fullName,
      packageName: bookings.packageName,
      durationHours: bookings.durationHours,
      locationType: bookings.locationType,
      hospitalName: hospitals.name,
      wardNo: bookings.wardNo,
      bedNo: bookings.bedNo,
      serviceAddress: bookings.serviceAddress,
      rate: bookings.rate,
      invoiceNo: invoices.invoiceNo,
      printedAt: invoices.printedAt,
    })
    .from(bookings)
    .innerJoin(employees, eq(employees.id, bookings.employeeId))
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(patients, eq(patients.id, bookings.patientId))
    .leftJoin(hospitals, eq(hospitals.id, bookings.hospitalId))
    .leftJoin(branches, eq(branches.id, bookings.branchId))
    .leftJoin(invoices, eq(invoices.bookingId, bookings.id))
    .where(completedWhere(user, q))
    .orderBy(desc(bookings.serviceDate), asc(employees.fullName));
}
