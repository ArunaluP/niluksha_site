import "server-only";
import { and, asc, count, desc, eq, gte, lte, ne, sum } from "drizzle-orm";
import { db } from "@/db";
import { BOOKING_STATUSES, type BookingStatus, bookings, bookingStatusLogs, customers, employees, invoices, patients, users } from "@/db/schema";
import type { CurrentUser } from "@/lib/dal";
import { addDays, today } from "@/lib/dates";
import { branchScope } from "@/lib/permissions";
import { listAvailableEmployees } from "../employees/service";

function emptyStatusMap() {
  return Object.fromEntries(BOOKING_STATUSES.map((s) => [s, 0])) as Record<BookingStatus, number>;
}

/** Booking counts for a day + invoices waiting to be printed (branch-scoped). Used by GET /api/dashboard. */
export async function getDashboard(date: string, user: CurrentUser) {
  const [byStatus, [waiting], [delivered]] = await Promise.all([
    db
      .select({ status: bookings.status, total: count() })
      .from(bookings)
      .where(and(eq(bookings.serviceDate, date), branchScope(user, bookings.branchId)))
      .groupBy(bookings.status),
    db
      .select({ total: count(), amount: sum(invoices.amount) })
      .from(invoices)
      .where(and(eq(invoices.status, "generated"), branchScope(user, invoices.branchId))),
    db
      .select({ total: count(), amount: sum(invoices.amount) })
      .from(invoices)
      .where(and(eq(invoices.invoiceDate, date), branchScope(user, invoices.branchId))),
  ]);

  const bookingsByStatus = emptyStatusMap();
  for (const r of byStatus) bookingsByStatus[r.status] = r.total;

  return {
    date,
    bookingsByStatus,
    totalBookings: byStatus.reduce((a, r) => a + r.total, 0),
    invoicesWaitingToPrint: { count: waiting.total, amount: waiting.amount ?? "0.00" },
    invoicedOnDate: { count: delivered.total, amount: delivered.amount ?? "0.00" },
  };
}

/** Everything the dashboard screen shows, in one call. */
export async function getDashboardScreen(user: CurrentUser) {
  const t = today();
  const weekEnd = addDays(t, 6);
  const monthStart = `${t.slice(0, 7)}-01`;
  const scope = branchScope(user, bookings.branchId);

  const [summary, weekRows, monthRows, schedule, activity, free] = await Promise.all([
    getDashboard(t, user),
    db
      .select({ date: bookings.serviceDate, status: bookings.status, total: count() })
      .from(bookings)
      .where(and(gte(bookings.serviceDate, t), lte(bookings.serviceDate, weekEnd), scope))
      .groupBy(bookings.serviceDate, bookings.status),
    db
      .select({ status: bookings.status, total: count() })
      .from(bookings)
      .where(and(gte(bookings.serviceDate, monthStart), lte(bookings.serviceDate, t), scope))
      .groupBy(bookings.status),
    db
      .select({
        id: bookings.id,
        bookingNo: bookings.bookingNo,
        startTime: bookings.startTime,
        status: bookings.status,
        locationType: bookings.locationType,
        customerName: customers.fullName,
        patientName: patients.fullName,
        employeeName: employees.fullName,
      })
      .from(bookings)
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .innerJoin(patients, eq(patients.id, bookings.patientId))
      .leftJoin(employees, eq(employees.id, bookings.employeeId))
      .where(and(eq(bookings.serviceDate, t), ne(bookings.status, "ignored"), scope))
      .orderBy(asc(bookings.startTime))
      .limit(6),
    db
      .select({
        id: bookingStatusLogs.id,
        bookingId: bookingStatusLogs.bookingId,
        bookingNo: bookings.bookingNo,
        toStatus: bookingStatusLogs.toStatus,
        userName: users.name,
        createdAt: bookingStatusLogs.createdAt,
      })
      .from(bookingStatusLogs)
      .innerJoin(bookings, eq(bookings.id, bookingStatusLogs.bookingId))
      .innerJoin(users, eq(users.id, bookingStatusLogs.userId))
      .where(scope)
      .orderBy(desc(bookingStatusLogs.id))
      .limit(6),
    listAvailableEmployees(t, user.role === "branch_manager" ? (user.branchId ?? -1) : undefined),
  ]);

  // 7-day outlook: days × statuses
  const days = Array.from({ length: 7 }, (_, i) => addDays(t, i));
  const week = days.map((d): { date: string; total: number } & Record<BookingStatus, number> => {
    const row = emptyStatusMap();
    for (const r of weekRows.filter((w) => w.date === d)) row[r.status] = r.total;
    return { date: d, ...row, total: Object.values(row).reduce((a, b) => a + b, 0) - row.ignored };
  });

  const monthMix = emptyStatusMap();
  for (const r of monthRows) monthMix[r.status] = r.total;

  const freeByBranch = Object.entries(
    free.reduce<Record<string, number>>((acc, e) => ((acc[e.branchName] = (acc[e.branchName] ?? 0) + 1), acc), {}),
  ).map(([branch, n]) => ({ branch, count: n }));

  return { date: t, summary, week, monthMix, schedule, activity, freeToday: free.length, freeByBranch };
}
