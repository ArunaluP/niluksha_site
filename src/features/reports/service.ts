import "server-only";
import { and, asc, count, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import * as z from "zod";
import { db } from "@/db";
import { bookings, bookingStatusLogs, branches, customers, employees, invoices, patients, users } from "@/db/schema";
import type { CurrentUser } from "@/lib/dal";
import { addDays, today } from "@/lib/dates";
import { branchScope } from "@/lib/permissions";
import { id, isoDate, pageParams, pagination } from "@/lib/validation";
import { classifyEvent, daysBetween, EVENT_KEYS, EVENT_RULES, eventFilterKeys, periodLabel, type EventKey, type EventRule } from "./events";

/**
 * Activity report: everything that happened (every booking status change)
 * in a period, with the booking's CURRENT status, plus totals.
 *
 * Who sees what (same rule as the Bookings page):
 *   Director / call center → everything (Director may filter by branch)
 *   Branch manager         → only bookings assigned to their branch
 */

export const MAX_REPORT_DAYS = 366;

// ======================================================================= query
export const ReportQuery = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    event: z.enum(EVENT_KEYS, { error: `Event must be one of: ${EVENT_KEYS.join(", ")}.` }).optional(),
    branchId: id.optional(), // Director only; ignored for other roles
    page: pagination.page,
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .transform((q, ctx) => {
    const t = today();
    const to = q.to ?? t;
    const from = q.from ?? to;
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

export type ReportQueryInput = z.infer<typeof ReportQuery>;

// ======================================================================= SQL pieces (built from EVENT_RULES)
const logs = bookingStatusLogs;

/** One rule as a WHERE condition on the log row. */
function ruleCondition(r: EventRule): SQL {
  const to = eq(logs.toStatus, r.to);
  if (r.from === "any") return to;
  if (r.from === null) return and(isNull(logs.fromStatus), to)!;
  return and(eq(logs.fromStatus, r.from), to)!;
}

const ruleFor = (key: EventKey) => EVENT_RULES.find((r) => r.key === key)!;
const eventCondition = (key: EventKey) => ruleCondition(ruleFor(key));

/** CASE WHEN <rule> THEN '<key>' … END — the same mapping as classifyEvent(), in SQL. */
function eventCase(): SQL<EventKey | null> {
  const whens = EVENT_RULES.map((r) => sql`WHEN ${ruleCondition(r)} THEN ${r.key}`);
  return sql<EventKey | null>`CASE ${sql.join(whens, sql` `)} ELSE NULL END`;
}

/**
 * Period + who-may-see-what. Half-open range on created_at (stored in Sri Lanka time):
 * created_at >= 'from 00:00:00' AND created_at < 'to+1 00:00:00'  (uses idx_logs_created).
 */
function scopeWhere(user: CurrentUser, q: ReportQueryInput): SQL {
  const branchId = user.role === "admin" ? q.branchId : undefined;
  return and(
    sql`${logs.createdAt} >= ${`${q.from} 00:00:00`}`,
    sql`${logs.createdAt} < ${`${addDays(q.to, 1)} 00:00:00`}`,
    branchScope(user, bookings.branchId),
    branchId ? eq(bookings.branchId, branchId) : undefined,
  )!;
}

/**
 * ONE row per booking: the booking's LAST status-log row in the period (highest id,
 * which is also the latest time). `id IN (SELECT MAX(id) … GROUP BY booking_id)`.
 */
function latestPerBooking(user: CurrentUser, q: ReportQueryInput): SQL {
  const lastIds = db
    .select({ id: sql<number>`MAX(${logs.id})`.as("last_id") })
    .from(logs)
    .innerJoin(bookings, eq(bookings.id, logs.bookingId))
    .where(scopeWhere(user, q))
    .groupBy(logs.bookingId);
  return inArray(logs.id, lastIds);
}

// ======================================================================= events
const eventColumns = {
  id: logs.id,
  // Raw 'YYYY-MM-DD HH:MM:SS' (Sri Lanka wall time, like the range filter). Drizzle's
  // datetime column would read it as UTC and shift it by 5:30, so it's parsed below.
  at: sql<string>`${logs.createdAt}`,
  fromStatus: logs.fromStatus,
  toStatus: logs.toStatus,
  note: logs.note,
  bookingId: bookings.id,
  bookingNo: bookings.bookingNo,
  status: bookings.status,
  serviceDate: bookings.serviceDate,
  startTime: bookings.startTime,
  packageName: bookings.packageName,
  durationHours: bookings.durationHours,
  rate: bookings.rate,
  locationType: bookings.locationType,
  customerId: bookings.customerId,
  customerName: customers.fullName,
  customerPhone: customers.phone,
  patientName: patients.fullName,
  employeeId: bookings.employeeId,
  employeeName: employees.fullName,
  branchId: bookings.branchId,
  branchName: branches.name,
  doneBy: users.name,
  invoiceId: invoices.id,
  invoiceNo: invoices.invoiceNo,
};

/**
 * One row per booking touched in the period: its last event there (the step it
 * reached), newest first, plus `steps` = every event of that booking in the period.
 * ?event= filters on that last step. `all: true` returns every row (print + CSV).
 */
export async function listActivityEvents(user: CurrentUser, q: ReportQueryInput, opts: { all?: boolean } = {}) {
  const where = and(latestPerBooking(user, q), q.event ? or(...eventFilterKeys(q.event).map(eventCondition)) : undefined);

  const rows = db
    .select(eventColumns)
    .from(logs)
    .innerJoin(bookings, eq(bookings.id, logs.bookingId))
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(patients, eq(patients.id, bookings.patientId))
    .innerJoin(users, eq(users.id, logs.userId))
    .leftJoin(employees, eq(employees.id, bookings.employeeId))
    .leftJoin(branches, eq(branches.id, bookings.branchId))
    .leftJoin(invoices, eq(invoices.bookingId, bookings.id))
    .where(where)
    .orderBy(desc(logs.createdAt), desc(logs.id))
    .$dynamic();
  const { limit, offset } = pageParams(q);

  const [items, [{ total }]] = await Promise.all([
    opts.all ? rows : rows.limit(limit).offset(offset),
    db.select({ total: count() }).from(logs).innerJoin(bookings, eq(bookings.id, logs.bookingId)).where(where),
  ]);

  // The trail: all of these bookings' events in the period, oldest first.
  const ids = items.map((r) => r.bookingId);
  const trail = ids.length
    ? await db
        .select({ bookingId: logs.bookingId, fromStatus: logs.fromStatus, toStatus: logs.toStatus })
        .from(logs)
        .where(and(inArray(logs.bookingId, ids), sql`${logs.createdAt} >= ${`${q.from} 00:00:00`}`, sql`${logs.createdAt} < ${`${addDays(q.to, 1)} 00:00:00`}`))
        .orderBy(asc(logs.id))
    : [];
  const steps = new Map<number, (EventKey | null)[]>();
  for (const t of trail) steps.set(t.bookingId, [...(steps.get(t.bookingId) ?? []), classifyEvent(t.fromStatus, t.toStatus)]);

  return {
    items: items.map((r) => ({ ...r, at: new Date(`${String(r.at).replace(" ", "T")}+05:30`), event: classifyEvent(r.fromStatus, r.toStatus), steps: steps.get(r.bookingId) ?? [] })),
    total,
  };
}

export type ActivityEvent = Awaited<ReturnType<typeof listActivityEvents>>["items"][number];

// ======================================================================= totals
async function countEvents(where: SQL) {
  const rows = await db
    .select({ event: eventCase().as("ev"), n: count() })
    .from(logs)
    .innerJoin(bookings, eq(bookings.id, logs.bookingId))
    .where(where)
    .groupBy(sql`ev`);
  const counts = Object.fromEntries(EVENT_KEYS.map((k) => [k, 0])) as Record<EventKey, number>;
  for (const r of rows) if (r.event) counts[r.event] = r.n;
  return counts;
}

const sessionValue = sql<string>`COALESCE(SUM(${bookings.rate}), 0)`;

async function moneyTotals(where: SQL) {
  const [[delivered], [printed]] = await Promise.all([
    db
      .select({ value: sessionValue, count: count() })
      .from(logs)
      .innerJoin(bookings, eq(bookings.id, logs.bookingId))
      .where(and(where, eventCondition("delivered"))),
    db
      .select({ value: sql<string>`COALESCE(SUM(${invoices.amount}), 0)`, count: count(invoices.id) })
      .from(logs)
      .innerJoin(bookings, eq(bookings.id, logs.bookingId))
      .leftJoin(invoices, eq(invoices.bookingId, bookings.id))
      .where(and(where, eventCondition("invoice_printed"))),
  ]);
  return { delivered, invoicesPrinted: printed };
}

/** Sessions delivered in the period, by branch and by package (highest value first). */
async function deliveredBreakdowns(where: SQL) {
  const delivered = and(where, eventCondition("delivered"));
  const [byBranch, byPackage] = await Promise.all([
    db
      .select({ branchId: bookings.branchId, branchName: branches.name, sessions: count(), value: sessionValue.as("value") })
      .from(logs)
      .innerJoin(bookings, eq(bookings.id, logs.bookingId))
      .leftJoin(branches, eq(branches.id, bookings.branchId))
      .where(delivered)
      .groupBy(bookings.branchId, branches.name)
      .orderBy(sql`value DESC`, branches.name),
    db
      .select({ packageName: bookings.packageName, durationHours: bookings.durationHours, sessions: count(), value: sessionValue.as("value") })
      .from(logs)
      .innerJoin(bookings, eq(bookings.id, logs.bookingId))
      .where(delivered)
      .groupBy(bookings.packageName, bookings.durationHours)
      .orderBy(sql`value DESC`, bookings.packageName),
  ]);
  return { byBranch, byPackage };
}

// ======================================================================= the report
/**
 * counts: each booking once, under the last step it reached in the period.
 * money + breakdowns: EVERY delivery / invoice printed in the period (a booking
 * delivered and then printed the same day still adds to Delivered value).
 */
export async function getActivityReport(user: CurrentUser, q: ReportQueryInput, opts: { all?: boolean } = {}) {
  const where = scopeWhere(user, q);
  const [counts, money, breakdowns, events] = await Promise.all([
    countEvents(and(where, latestPerBooking(user, q))!),
    moneyTotals(where),
    deliveredBreakdowns(where),
    listActivityEvents(user, q, opts),
  ]);
  return {
    period: { from: q.from, to: q.to, days: daysBetween(q.from, q.to) + 1, label: periodLabel(q.from, q.to) },
    filters: { event: q.event ?? null, branchId: user.role === "admin" ? (q.branchId ?? null) : null },
    counts,
    money,
    byBranch: breakdowns.byBranch,
    byPackage: breakdowns.byPackage,
    events: events.items,
    total: events.total,
    page: opts.all ? 1 : q.page,
    pageSize: opts.all ? events.total : q.pageSize,
  };
}

export type ActivityReport = Awaited<ReturnType<typeof getActivityReport>>;
