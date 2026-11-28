import { and, desc, eq, like, or, asc } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { db } from "@/db";
import { bookings, branches, customers, employees, patients } from "@/db/schema";
import type { CurrentUser } from "@/lib/dal";
import { normalizePhone } from "@/lib/lk-rules";
import { bookingScope, branchScope, hasPermission } from "@/lib/permissions";

const LIMIT = 5;

/** "%term%" with LIKE wildcards in the user's text escaped. */
const pattern = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * Sidebar search (Ctrl+K): bookings, customers and employees, each limited to what the
 * user may open (branch managers: new bookings + own branch, own branch's employees).
 */
export async function globalSearch(raw: string, user: CurrentUser) {
  const q = raw.trim().slice(0, 60);
  const empty = { bookings: [], customers: [], employees: [] };
  if (q.length < 2) return empty;
  const s = pattern(q);
  const phone = normalizePhone(q);
  const p = phone ? pattern(phone) : s;
  const bookingCustomer = alias(customers, "bc");

  const [bookingRows, customerRows, employeeRows] = await Promise.all([
    hasPermission(user, "viewReports")
      ? db
          .select({
            bookingNo: bookings.bookingNo,
            status: bookings.status,
            serviceDate: bookings.serviceDate,
            patientName: patients.fullName,
            customerName: bookingCustomer.fullName,
          })
          .from(bookings)
          .innerJoin(patients, eq(patients.id, bookings.patientId))
          .innerJoin(bookingCustomer, eq(bookingCustomer.id, bookings.customerId))
          .where(
            and(
              bookingScope(user, bookings.branchId),
              or(like(bookings.bookingNo, s), like(patients.fullName, s), like(bookingCustomer.fullName, s), like(bookingCustomer.phone, p)),
            ),
          )
          .orderBy(desc(bookings.serviceDate), desc(bookings.id))
          .limit(LIMIT)
      : [],
    hasPermission(user, "manageCustomers")
      ? db
          .select({ id: customers.id, customerNo: customers.customerNo, fullName: customers.fullName, phone: customers.phone })
          .from(customers)
          .where(or(like(customers.fullName, s), like(customers.customerNo, s), like(customers.phone, p), like(customers.altPhone, p), like(customers.nic, s)))
          .orderBy(asc(customers.fullName))
          .limit(LIMIT)
      : [],
    hasPermission(user, "viewMasterData")
      ? db
          .select({ id: employees.id, empNo: employees.empNo, fullName: employees.fullName, designation: employees.designation, branchName: branches.name })
          .from(employees)
          .innerJoin(branches, eq(branches.id, employees.branchId))
          .where(
            and(
              branchScope(user, employees.branchId),
              or(like(employees.fullName, s), like(employees.empNo, s), like(employees.fileNo, s), like(employees.phone, p), like(employees.nic, s)),
            ),
          )
          .orderBy(asc(employees.fullName))
          .limit(LIMIT)
      : [],
  ]);
  return { bookings: bookingRows, customers: customerRows, employees: employeeRows };
}
