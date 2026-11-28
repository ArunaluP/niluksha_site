import "server-only";
import { and, asc, count, desc, eq, gte, inArray, like, lte, ne, notExists, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import * as z from "zod";
import { db, type Tx } from "@/db";
import { ASSIGNABLE_DESIGNATIONS, bookings, branches, DESIGNATIONS, employeeLeaves, employeePhotos, employees, users } from "@/db/schema";
import { DISTRICTS, DOCUMENTS, HEARD_FROM, PHOTO_MAX_BYTES } from "./registration";
import type { CurrentUser } from "@/lib/dal";
import { AppError, ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { branchScope, canAccessBranch } from "@/lib/permissions";
import { checkAgainstNic } from "@/lib/nic-check";
import { nextNumber } from "@/lib/sequences";
import { id, isoDate, nullableAddress, nullableEmail, nullablePhone, optAddress, optEmail, optPhone, nameFields, nameFieldsUpdate, nullableBirthDate, nullableNic, optBirthDate, optNic, nullableText, optText, pageParams, pagination, personName, phone, type Paged } from "@/lib/validation";

/** Booking statuses that keep an employee busy on that date. */
export const BUSY_STATUSES = ["assigned", "delivered", "invoice_printed"] as const;

// ---------------------------------------------------------------- schemas
/** "" → undefined (create) / null (update) so empty boxes are left out or cleared. */
const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

/** Employee number from the paper form: letters, digits, - and / (e.g. 1045, SN/1045). */
const fileNo = z
  .string()
  .trim()
  .max(30, { error: "Employee number must be 30 characters or fewer." })
  .regex(/^[A-Za-z0-9][A-Za-z0-9\-\/ ]*$/, { error: "Employee number can only contain letters, numbers, - and /." })
  .transform((v) => v.toUpperCase().replace(/\s+/g, " "));

/** Webcam photo sent from the browser as a data URL (JPEG or PNG). */
const photoDataUrl = z.string().regex(/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/, { error: "The photo could not be read. Take it again." });

const docFlags = Object.fromEntries(DOCUMENTS.map((d) => [d.key, z.boolean().optional()])) as Record<(typeof DOCUMENTS)[number]["key"], z.ZodOptional<z.ZodBoolean>>;

/** Registration-form fields (create): all optional. */
const registrationCreate = {
  fileNo: z.preprocess(emptyToUndef, fileNo.optional()),
  gnDivision: optText(100),
  district: z.preprocess(emptyToUndef, z.enum(DISTRICTS, { error: "Choose a district from the list." }).optional()),
  nearestPolice: optText(100),
  nearestPostOffice: optText(100),
  guardianName: z.preprocess(emptyToUndef, personName("Guardian name").optional()),
  guardianRelationship: optText(60),
  guardianAddress: optAddress,
  guardianPhone: optPhone,
  ...docFlags,
  heardFrom: z.preprocess(emptyToUndef, z.enum(HEARD_FROM, { error: "Choose how they heard about us." }).optional()),
  referredBy: z.preprocess(emptyToUndef, id.optional()),
  /** true = the employee accepted the rules & declaration (recorded with the time and your login). */
  rulesAgreed: z.boolean().optional(),
  photo: z.preprocess(emptyToUndef, photoDataUrl.optional()),
};

/** Same for updates: "" / null clears a value; photo null removes the photo. */
const registrationUpdate = {
  fileNo: z.preprocess(emptyToNull, fileNo.nullable().optional()),
  gnDivision: nullableText(100),
  district: z.preprocess(emptyToNull, z.enum(DISTRICTS, { error: "Choose a district from the list." }).nullable().optional()),
  nearestPolice: nullableText(100),
  nearestPostOffice: nullableText(100),
  guardianName: z.preprocess(emptyToNull, personName("Guardian name").nullable().optional()),
  guardianRelationship: nullableText(60),
  guardianAddress: nullableAddress,
  guardianPhone: nullablePhone,
  ...docFlags,
  heardFrom: z.preprocess(emptyToNull, z.enum(HEARD_FROM, { error: "Choose how they heard about us." }).nullable().optional()),
  referredBy: z.preprocess(emptyToNull, id.nullable().optional()),
  rulesAgreed: z.boolean().optional(),
  photo: z.preprocess(emptyToNull, photoDataUrl.nullable().optional()),
};

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
  ...registrationCreate,
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
  ...registrationUpdate,
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
const referrer = alias(employees, "referrer");

const employeeColumns = {
  id: employees.id,
  empNo: employees.empNo,
  fileNo: employees.fileNo,
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
  /** Last time the photo changed (null = no photo). Used as ?v= so browsers reload a new photo. */
  photoAt: employeePhotos.updatedAt,
};

/** Everything on the registration form (detail page, edit form, printed form). */
const detailColumns = {
  ...employeeColumns,
  gnDivision: employees.gnDivision,
  district: employees.district,
  nearestPolice: employees.nearestPolice,
  nearestPostOffice: employees.nearestPostOffice,
  guardianName: employees.guardianName,
  guardianRelationship: employees.guardianRelationship,
  guardianAddress: employees.guardianAddress,
  guardianPhone: employees.guardianPhone,
  docGnCertificate: employees.docGnCertificate,
  docNicCopy: employees.docNicCopy,
  docPoliceCertificate: employees.docPoliceCertificate,
  docCharacterCertificate: employees.docCharacterCertificate,
  docBirthCertificate: employees.docBirthCertificate,
  heardFrom: employees.heardFrom,
  referredBy: employees.referredBy,
  referrerName: referrer.fullName,
  referrerEmpNo: referrer.empNo,
  rulesAgreedAt: employees.rulesAgreedAt,
  rulesAgreedByName: users.name,
};

export async function listEmployees(q: z.infer<typeof EmployeeListQuery>, user: CurrentUser): Promise<Paged<unknown>> {
  const where: (SQL | undefined)[] = [branchScope(user, employees.branchId)];
  if (q.branchId) where.push(eq(employees.branchId, q.branchId));
  if (q.status) where.push(eq(employees.status, q.status));
  if (q.designation) where.push(eq(employees.designation, q.designation));
  if (q.search) {
    const s = `%${q.search}%`;
    where.push(or(like(employees.fullName, s), like(employees.empNo, s), like(employees.fileNo, s), like(employees.phone, s), like(employees.nic, s)));
  }
  const { limit, offset } = pageParams(q);
  const [items, [{ total }]] = await Promise.all([
    db
      .select(employeeColumns)
      .from(employees)
      .innerJoin(branches, eq(branches.id, employees.branchId))
      .leftJoin(employeePhotos, eq(employeePhotos.employeeId, employees.id))
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
    .select(detailColumns)
    .from(employees)
    .innerJoin(branches, eq(branches.id, employees.branchId))
    .leftJoin(employeePhotos, eq(employeePhotos.employeeId, employees.id))
    .leftJoin(referrer, eq(referrer.id, employees.referredBy))
    .leftJoin(users, eq(users.id, employees.rulesAgreedBy))
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

/** Employees that can be chosen as "referred by" (same branch scope as the list). */
export async function listReferrers(user: CurrentUser) {
  return db
    .select({ id: employees.id, empNo: employees.empNo, fileNo: employees.fileNo, fullName: employees.fullName })
    .from(employees)
    .where(branchScope(user, employees.branchId))
    .orderBy(asc(employees.fullName));
}

/** The photo bytes, or null. Same branch rules as viewing the employee. */
export async function getEmployeePhoto(employeeId: number, user: CurrentUser) {
  await getEmployee(employeeId, user);
  const [p] = await db.select().from(employeePhotos).where(eq(employeePhotos.employeeId, employeeId));
  return p ?? null;
}

/** Decodes and checks a data-URL photo: real JPEG/PNG bytes, not too big. */
function decodePhoto(dataUrl: string) {
  const [, mime, b64] = dataUrl.match(/^data:(image\/(?:jpeg|png));base64,(.+)$/)!;
  const data = Buffer.from(b64, "base64");
  const isJpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const isPng = data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (!(mime === "image/jpeg" ? isJpeg : isPng)) throw new AppError("The photo is not a valid image. Take it again.");
  if (data.length > PHOTO_MAX_BYTES) throw new AppError(`The photo is too large (max ${Math.round(PHOTO_MAX_BYTES / 1024)} KB).`);
  return { mime, data };
}

async function savePhoto(tx: Tx, employeeId: number, photo: string | null) {
  if (photo === null) {
    await tx.delete(employeePhotos).where(eq(employeePhotos.employeeId, employeeId));
    return;
  }
  const { mime, data } = decodePhoto(photo);
  await tx.insert(employeePhotos).values({ employeeId, mime, data }).onDuplicateKeyUpdate({ set: { mime, data } });
}

/** "Referred by" must be another existing employee, and only when heardFrom = employee. */
async function checkReferrer(referredBy: number | null | undefined, selfId?: number) {
  if (!referredBy) return;
  if (referredBy === selfId) throw new AppError("An employee cannot refer themselves.");
  const [r] = await db.select({ id: employees.id }).from(employees).where(eq(employees.id, referredBy));
  if (!r) throw new AppError("The referring employee was not found.");
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
  const { photo, rulesAgreed, ...fields } = input;
  if (fields.heardFrom !== "employee") fields.referredBy = undefined;
  await checkReferrer(fields.referredBy);
  if (photo) decodePhoto(photo); // check before saving anything
  const employeeId = await db.transaction(async (tx) => {
    const empNo = await nextNumber(tx, "employee");
    const [res] = await tx.insert(employees).values({
      ...fields,
      empNo,
      ...(rulesAgreed ? { rulesAgreedAt: new Date(), rulesAgreedBy: user.id } : {}),
    });
    if (photo) await savePhoto(tx, res.insertId, photo);
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
  const { photo, rulesAgreed, ...fields } = input;
  const heardFrom = fields.heardFrom !== undefined ? fields.heardFrom : saved.heardFrom;
  if (heardFrom !== "employee") fields.referredBy = null;
  await checkReferrer(fields.referredBy, employeeId);
  if (photo) decodePhoto(photo);

  const set: Partial<typeof employees.$inferInsert> = { ...fields };
  if (rulesAgreed === true && !saved.rulesAgreedAt) Object.assign(set, { rulesAgreedAt: new Date(), rulesAgreedBy: user.id });
  if (rulesAgreed === false) Object.assign(set, { rulesAgreedAt: null, rulesAgreedBy: null });

  await db.transaction(async (tx) => {
    if (Object.keys(set).length) await tx.update(employees).set(set).where(eq(employees.id, employeeId));
    if (photo !== undefined) await savePhoto(tx, employeeId, photo);
  });
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
    .select({ bookingNo: bookings.bookingNo, serviceDate: bookings.serviceDate, endDate: bookings.endDate })
    .from(bookings)
    .where(
      and(
        eq(bookings.employeeId, employeeId),
        inArray(bookings.status, [...BUSY_STATUSES]),
        // any day of the booking (service_date … end_date) inside the leave
        lte(bookings.serviceDate, input.toDate),
        gte(bookings.endDate, input.fromDate),
      ),
    )
    .limit(5);
  if (clash.length) {
    const list = clash.map((c) => `${c.bookingNo} (${c.serviceDate === c.endDate ? c.serviceDate : `${c.serviceDate} to ${c.endDate}`})`).join(", ");
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
/**
 * Caregivers / nurses free on EVERY day from `date` to `to` (default: just `date`):
 * no leave and no other active booking on any of those days.
 * `excludeBookingId`: ignore this booking (when changing its own days).
 */
export async function listAvailableEmployees(date: string, branchId?: number, to: string = date, excludeBookingId?: number) {
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
                lte(employeeLeaves.fromDate, to),
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
                lte(bookings.serviceDate, to),
                gte(bookings.endDate, date),
                inArray(bookings.status, [...BUSY_STATUSES]),
                excludeBookingId ? ne(bookings.id, excludeBookingId) : undefined,
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(branches.name), asc(employees.fullName));
}

/**
 * Throws a clear error if this employee can't work every day from `date` to `to`:
 * inactive, not a caregiver/nurse, on leave, or already booked on one of those days.
 * Inside a transaction (`opts.tx`) the employee row is locked first, so two people
 * assigning the same caregiver at the same moment can't both succeed.
 */
export async function assertEmployeeCanWork(employeeId: number, date: string, to: string = date, opts: { tx?: Tx; excludeBookingId?: number } = {}) {
  const q = opts.tx ?? db;
  const [emp] = await q
    .select({ status: employees.status, branchId: employees.branchId, fullName: employees.fullName, designation: employees.designation })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .for("update");
  if (!emp) throw new AppError("Employee not found.");
  if (emp.status !== "active") throw new AppError(`${emp.fullName} is inactive.`);
  if (!(ASSIGNABLE_DESIGNATIONS as readonly string[]).includes(emp.designation)) {
    throw new AppError(`${emp.fullName} is a ${emp.designation}; only Caregivers and Nurses can be assigned to patients.`);
  }

  const [leave] = await q
    .select({ fromDate: employeeLeaves.fromDate, toDate: employeeLeaves.toDate })
    .from(employeeLeaves)
    .where(and(eq(employeeLeaves.employeeId, employeeId), lte(employeeLeaves.fromDate, to), gte(employeeLeaves.toDate, date)))
    .limit(1);
  if (leave) {
    const when = leave.fromDate === leave.toDate ? leave.fromDate : `${leave.fromDate} to ${leave.toDate}`;
    throw new ConflictError(`${emp.fullName} is on leave (${when}).`);
  }

  const [busy] = await q
    .select({ bookingNo: bookings.bookingNo, serviceDate: bookings.serviceDate, endDate: bookings.endDate })
    .from(bookings)
    .where(
      and(
        eq(bookings.employeeId, employeeId),
        inArray(bookings.status, [...BUSY_STATUSES]),
        lte(bookings.serviceDate, to),
        gte(bookings.endDate, date),
        opts.excludeBookingId ? ne(bookings.id, opts.excludeBookingId) : undefined,
      ),
    )
    .limit(1);
  if (busy) {
    const when = busy.serviceDate === busy.endDate ? busy.serviceDate : `${busy.serviceDate} to ${busy.endDate}`;
    throw new ConflictError(`${emp.fullName} is already booked on ${busy.bookingNo} (${when}).`);
  }
  return emp;
}
