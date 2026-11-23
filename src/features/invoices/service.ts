import "server-only";
import { and, count, desc, eq, gte, like, lte, or, sql, type SQL } from "drizzle-orm";
import * as z from "zod";
import { db } from "@/db";
import { bookings, branches, customers, employees, hospitals, invoices, patients, users } from "@/db/schema";
import type { CurrentUser } from "@/lib/dal";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { branchScope, canAccessBranch } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { id, isoDate, optText, pageParams, pagination, type Paged } from "@/lib/validation";
import { applyTransition, lockBooking } from "../bookings/status";

export const InvoiceListQuery = z.object({
  status: z.enum(["generated", "printed"]).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  branchId: id.optional(),
  customerId: id.optional(),
  q: optText(100), // invoice no, booking no, customer name/phone
  ...pagination,
});

const columns = {
  id: invoices.id,
  invoiceNo: invoices.invoiceNo,
  invoiceDate: invoices.invoiceDate,
  status: invoices.status,
  rate: invoices.rate,
  qty: invoices.qty,
  amount: invoices.amount,
  printCount: invoices.printCount,
  printedAt: invoices.printedAt,
  bookingId: invoices.bookingId,
  bookingNo: bookings.bookingNo,
  serviceDate: bookings.serviceDate,
  customerId: invoices.customerId,
  customerName: customers.fullName,
  customerPhone: customers.phone,
  branchId: invoices.branchId,
  branchName: branches.name,
};

function baseQuery() {
  return db
    .select(columns)
    .from(invoices)
    .innerJoin(bookings, eq(bookings.id, invoices.bookingId))
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .innerJoin(branches, eq(branches.id, invoices.branchId))
    .$dynamic();
}

export async function listInvoices(q: z.infer<typeof InvoiceListQuery>, user: CurrentUser): Promise<Paged<unknown>> {
  const where: (SQL | undefined)[] = [branchScope(user, invoices.branchId)];
  if (q.status) where.push(eq(invoices.status, q.status));
  if (q.from) where.push(gte(invoices.invoiceDate, q.from));
  if (q.to) where.push(lte(invoices.invoiceDate, q.to));
  if (q.branchId) where.push(eq(invoices.branchId, q.branchId));
  if (q.customerId) where.push(eq(invoices.customerId, q.customerId));
  if (q.q) {
    const s = `%${q.q}%`;
    where.push(or(like(invoices.invoiceNo, s), like(bookings.bookingNo, s), like(customers.fullName, s), like(customers.phone, s)));
  }
  const { limit, offset } = pageParams(q);
  const [items, [{ total }]] = await Promise.all([
    baseQuery().where(and(...where)).orderBy(desc(invoices.invoiceDate), desc(invoices.id)).limit(limit).offset(offset),
    db
      .select({ total: count() })
      .from(invoices)
      .innerJoin(bookings, eq(bookings.id, invoices.bookingId))
      .innerJoin(customers, eq(customers.id, invoices.customerId))
      .where(and(...where)),
  ]);
  return { items, total, page: q.page, pageSize: q.pageSize };
}

/** Everything needed to print the invoice. */
export async function getInvoice(invoiceId: number, user: CurrentUser) {
  const [row] = await db
    .select({
      ...columns,
      customerNo: customers.customerNo,
      customerAddress: customers.address,
      patientName: patients.fullName,
      startTime: bookings.startTime,
      packageName: bookings.packageName,
      durationHours: bookings.durationHours,
      locationType: bookings.locationType,
      hospitalName: hospitals.name,
      wardNo: bookings.wardNo,
      bedNo: bookings.bedNo,
      serviceAddress: bookings.serviceAddress,
      employeeName: employees.fullName,
      employeeNo: employees.empNo,
      printedByName: users.name,
    })
    .from(invoices)
    .innerJoin(bookings, eq(bookings.id, invoices.bookingId))
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .innerJoin(branches, eq(branches.id, invoices.branchId))
    .innerJoin(patients, eq(patients.id, bookings.patientId))
    .leftJoin(hospitals, eq(hospitals.id, bookings.hospitalId))
    .leftJoin(employees, eq(employees.id, bookings.employeeId))
    .leftJoin(users, eq(users.id, invoices.printedBy))
    .where(eq(invoices.id, invoiceId));
  if (!row || !canAccessBranch(user, row.branchId)) throw new NotFoundError("Invoice");

  const s = await getSettings();
  const company = { name: s.company_name ?? "", address: s.company_address ?? "", phone: s.company_phone ?? "" };
  return { ...row, company };
}

/** Called each time the invoice PDF is printed/downloaded (counts reprints). */
export async function recordPrint(invoiceId: number, user: CurrentUser) {
  await getInvoice(invoiceId, user);
  await db.update(invoices).set({ printCount: sql`${invoices.printCount} + 1` }).where(eq(invoices.id, invoiceId));
  return getInvoice(invoiceId, user);
}

/** Final step: invoice handed over → invoice printed + booking closed. */
export async function markInvoicePrinted(invoiceId: number, user: CurrentUser, note?: string) {
  const inv = await getInvoice(invoiceId, user);
  if (inv.status === "printed") throw new ConflictError(`Invoice ${inv.invoiceNo} is already marked printed.`);

  await db.transaction(async (tx) => {
    const b = await lockBooking(tx, inv.bookingId);
    await tx
      .update(invoices)
      .set({
        status: "printed",
        printedBy: user.id,
        printedAt: new Date(),
        printCount: sql`GREATEST(${invoices.printCount}, 1)`,
      })
      .where(eq(invoices.id, invoiceId));
    await applyTransition(tx, b, "markPrinted", user, {}, note);
  });
  return getInvoice(invoiceId, user);
}
