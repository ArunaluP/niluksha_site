import "server-only";
import { and, asc, count, desc, eq, gte, inArray, like, lte, notExists, or, type SQL } from "drizzle-orm";
import * as z from "zod";
import { db } from "@/db";
import { ASSIGNABLE_DESIGNATIONS, bookings, branches, DESIGNATIONS, employeeLeaves, employees } from "@/db/schema";
import type { CurrentUser } from "@/lib/dal";
import { AppError, ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { branchScope, canAccessBranch } from "@/lib/permissions";
import { checkAgainstNic } from "@/lib/nic-check";
import { nextNumber } from "@/lib/sequences";
import { id, isoDate, nullableEmail, nullablePhone, optEmail, optPhone, nameFields, nameFieldsUpdate, nullableBirthDate, nullableNic, optBirthDate, optNic, nullableText, optText, pageParams, pagination, phone, reqText, type Paged } from "@/lib/validation";

/** Booking statuses that keep an employee busy on that date. */
export const BUSY_STATUSES = ["assigned", "delivered", "invoice_printed"] as const;

// ---------------------------------------------------------------- schemas
export const EmployeeCreateSchema = z.object({
  branchId: id,
  ...nameFields,
  nic: optNic,
  gender: z.enum(["male", "female"], { error: "Gender must be male or female." }),
  dob: optBirthDate,
  phone,
  altPhone: optPhone,
  email: optEmail,
  address: optText(255),
  designation: z.enum(DESIGNATIONS, { error: `Type must be one of: ${DESIGNATIONS.join(", ")}.` }).default("Caregiver"),
  qualifications: optText(2000),
  joinDate: isoDate.optional(),
});

export const EmployeeUpdateSchema = z.object({
  branchId: id.optional(),
  ...nameFieldsUpdate,
  nic: nullableNic,
  gender: z.enum(["male", "female"]).optional(),
  dob: nullableBirthDate,
  phone: phone.optional(),
  altPhone: nullablePhone,
  email: nullableEmail,
  address: nullableText(255),
  designation: z.enum(DESIGNATIONS, { error: `Type must be one of: ${DESIGNATIONS.join(", ")}.` }).optional(),
  qualifications: nullableText(2000),
  joinDate: isoDate.nullable().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const EmployeeListQuery = z.object({
  branchId: id.optional(),
  status: z.enum(["active", "inactive"]).optional(),
  designation: z.enum(DESIGNATIONS).optional(),
  search: optText(100),
  ...pagination,
});

export const LeaveCreateSchema = z
  .object({ fromDate: isoDate, toDate: isoDate, reason: optText(255) })
  .refine((l) => l.toDate >= l.fromDate, { error: "To date must be on or after from date.", path: ["toDate"] });

export const AvailableQuery = z.object({ date: isoDate, branchId: id.optional() });

// ---------------------------------------------------------------- queries
const employeeColumns = {
  id: employees.id,
  empNo: employees.empNo,
  branchId: employees.branchId,
  branchName: branches.name,
  firstName: employees.firstName,
  middleName: employees.middleName,
  lastName: employees.lastName,
  fullName: employees.fullName,
  nic: employees.nic,
  gender: employees.gender,
  dob: employees.dob,
  phone: employees.phone,
  altPhone: employees.altPhone,
  email: employees.email,
  address: employees.address,
  designation: employees.designation,
  qualifications: employees.qualifications,
  joinDate: employees.joinDate,
  status: employees.status,
  createdAt: employees.createdAt,
};

export async function listEmployees(q: z.infer<typeof EmployeeListQuery>, user: CurrentUser): Promise<Paged<unknown>> {
  const where: (SQL | undefined)[] = [branchScope(user, employees.branchId)];
  if (q.branchId) where.push(eq(employees.branchId, q.branchId));
  if (q.status) where.push(eq(employees.status, q.status));
  if (q.designation) where.push(eq(employees.designation, q.designation));
  if (q.search) {
    const s = `%${q.search}%`;
    where.push(or(like(employees.fullName, s), like(employees.empNo, s), like(employees.phone, s), like(employees.nic, s)));
  }
  const { limit, offset } = pageParams(q);
  const [items, [{ total }]] = await Promise.all([
    db
      .select(employeeColumns)
      .from(employees)
      .innerJoin(branches, eq(branches.id, employees.branchId))
      .where(and(...where))
      .orderBy(asc(employees.fullName))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(employees).where(and(...where)),
  ]);
  return { items, total, page: q.page, pageSize: q.pageSize };
}

export async function getEmployee(employeeId: number, user: CurrentUser) {
  const [row] = await db
    .select(employeeColumns)
    .from(employees)
    .innerJoin(branches, eq(branches.id, employees.branchId))
    .where(eq(employees.id, employeeId));
  if (!row || !canAccessBranch(user, row.branchId)) throw new NotFoundError("Employee");
  return row;
}

/** Employee + their leave records (most recent first). */
export async function getEmployeeDetail(employeeId: number, user: CurrentUser) {
  const employee = await getEmployee(employeeId, user);
  const leaves = await listLeaves(employeeId, user);
  return { ...employee, leaves };
}

function checkBranchForManager(user: CurrentUser, branchId: number) {
  if (!canAccessBranch(user, branchId)) throw new ForbiddenError("You can only manage employees of your own branch.");
}

async function checkBranchExists(branchId: number) {
  const [b] = await db.select({ isActive: branches.isActive }).from(branches).where(eq(branches.id, branchId));
  if (!b) throw new AppError("Branch not found.");
  if (!b.isActive) throw new AppError("This branch is inactive.");
}

export async function createEmployee(input: z.infer<typeof EmployeeCreateSchema>, user: CurrentUser) {
  checkBranchForManager(user, input.branchId);
  await checkBranchExists(input.branchId);
  const nicDob = checkAgainstNic(input);
  if (nicDob) input = { ...input, dob: nicDob };
  const employeeId = await db.transaction(async (tx) => {
    const empNo = await nextNumber(tx, "employee");
    const [res] = await tx.insert(employees).values({ ...input, empNo });
    return res.insertId;
  });
  return getEmployee(employeeId, user);
}

export async function updateEmployee(employeeId: number, input: z.infer<typeof EmployeeUpdateSchema>, user: CurrentUser) {
  const saved = await getEmployee(employeeId, user);
  const nicDob = checkAgainstNic(input, saved);
  if (nicDob) input = { ...input, dob: nicDob };
  if (input.branchId) {
    checkBranchForManager(user, input.branchId);
    await checkBranchExists(input.branchId);
  }
  if (Object.keys(input).length) await db.update(employees).set(input).where(eq(employees.id, employeeId));
  return getEmployee(employeeId, user);
}

// ---------------------------------------------------------------- leave
export async function listLeaves(employeeId: number, user: CurrentUser) {
  await getEmployee(employeeId, user);
  return db
    .select()
    .from(employeeLeaves)
    .where(eq(employeeLeaves.employeeId, employeeId))
    .orderBy(desc(employeeLeaves.fromDate));
}

export async function addLeave(employeeId: number, input: z.infer<typeof LeaveCreateSchema>, user: CurrentUser) {
  await getEmployee(employeeId, user);

  // Don't allow leave over days the employee is already booked.
  const clash = await db
    .select({ bookingNo: bookings.bookingNo, serviceDate: bookings.serviceDate })
    .from(bookings)
    .where(
      and(
        eq(bookings.employeeId, employeeId),
        inArray(bookings.status, [...BUSY_STATUSES]),
        gte(bookings.serviceDate, input.fromDate),
        lte(bookings.serviceDate, input.toDate),
      ),
    )
    .limit(5);
  if (clash.length) {
    const list = clash.map((c) => `${c.bookingNo} (${c.serviceDate})`).join(", ");
    throw new ConflictError(`This employee is assigned to bookings in that period: ${list}. Reassign them first.`);
  }

  const [res] = await db.insert(employeeLeaves).values({ ...input, employeeId, createdBy: user.id });
  const [row] = await db.select().from(employeeLeaves).where(eq(employeeLeaves.id, res.insertId));
  return row;
}

export async function deleteLeave(leaveId: number, user: CurrentUser) {
  const [leave] = await db.select().from(employeeLeaves).where(eq(employeeLeaves.id, leaveId));
  if (!leave) throw new NotFoundError("Leave record");
  await getEmployee(leave.employeeId, user); // branch check
  await db.delete(employeeLeaves).where(eq(employeeLeaves.id, leaveId));
  return { deleted: true, id: leaveId };
}

// ---------------------------------------------------------------- availability
/**
 * Employees free on a date, from ALL branches (head office assigns across branches):
 * Caregivers/Nurses only, active, not on leave that day, not already assigned/delivered that day.
 */
export async function listAvailableEmployees(date: string, branchId?: number) {
  return db
    .select({
      id: employees.id,
      empNo: employees.empNo,
      fullName: employees.fullName,
      gender: employees.gender,
      phone: employees.phone,
      designation: employees.designation,
      branchId: employees.branchId,
      branchName: branches.name,
    })
    .from(employees)
    .innerJoin(branches, eq(branches.id, employees.branchId))
    .where(
      and(
        eq(employees.status, "active"),
        inArray(employees.designation, [...ASSIGNABLE_DESIGNATIONS]),
        eq(branches.isActive, true),
        branchId ? eq(employees.branchId, branchId) : undefined,
        notExists(
          db
            .select({ one: employeeLeaves.id })
            .from(employeeLeaves)
            .where(
              and(
                eq(employeeLeaves.employeeId, employees.id),
                lte(employeeLeaves.fromDate, date),
                gte(employeeLeaves.toDate, date),
              ),
            ),
        ),
        notExists(
          db
            .select({ one: bookings.id })
            .from(bookings)
            .where(
              and(
                eq(bookings.employeeId, employees.id),
                eq(bookings.serviceDate, date),
                inArray(bookings.status, [...BUSY_STATUSES]),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(branches.name), asc(employees.fullName));
}

/** Throws a clear error if this employee can't take a booking on this date. */
export async function assertEmployeeCanWork(employeeId: number, date: string) {
  const [emp] = await db
    .select({ status: employees.status, branchId: employees.branchId, fullName: employees.fullName, designation: employees.designation })
    .from(employees)
    .where(eq(employees.id, employeeId));
  if (!emp) throw new AppError("Employee not found.");
  if (emp.status !== "active") throw new AppError(`${emp.fullName} is inactive.`);
  if (!(ASSIGNABLE_DESIGNATIONS as readonly string[]).includes(emp.designation)) {
    throw new AppError(`${emp.fullName} is a ${emp.designation}; only Caregivers and Nurses can be assigned to patients.`);
  }

  const [leave] = await db
    .select({ id: employeeLeaves.id })
    .from(employeeLeaves)
    .where(and(eq(employeeLeaves.employeeId, employeeId), lte(employeeLeaves.fromDate, date), gte(employeeLeaves.toDate, date)))
    .limit(1);
  if (leave) throw new ConflictError(`${emp.fullName} is on leave on ${date}.`);
  return emp;
}
