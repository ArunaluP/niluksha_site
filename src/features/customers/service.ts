import "server-only";
import { and, count, desc, eq, like, or, type SQL } from "drizzle-orm";
import * as z from "zod";
import { db } from "@/db";
import { bookings, customers, employees, patients } from "@/db/schema";
import type { CurrentUser } from "@/lib/dal";
import { NotFoundError } from "@/lib/errors";
import { normalizePhone } from "@/lib/lk-rules";
import { checkAgainstNic } from "@/lib/nic-check";
import { ValidationError } from "@/lib/errors";
import { nextNumber } from "@/lib/sequences";
import {
  isoDate,
  nullableAddress,
  nullableEmail,
  nullableBirthDate,
  nullableRelationshipOther,
  nullableCity,
  nullableNic,
  nullablePhone,
  nullableText,
  optAddress,
  optEmail,
  optBirthDate,
  optRelationshipOther,
  optCity,
  optNic,
  optPhone,
  optText,
  pageParams,
  pagination,
  nameFields,
  nameFieldsUpdate,
  phone,
  reqText,
  type Paged,
} from "@/lib/validation";

const RELATIONSHIPS = ["self", "parent", "spouse", "child", "sibling", "other"] as const;

// ---------------------------------------------------------------- schemas
export const PatientCreateSchema = z.object({
  ...nameFields,
  gender: z.enum(["male", "female"], {
    error: "Gender must be male or female.",
  }),
  dob: optBirthDate,
  relationship: z.enum(RELATIONSHIPS).default("self"),
  relationshipOther: optRelationshipOther,
  address: optText(255),
  careNotes: optText(2000),
});

export const PatientUpdateSchema = z.object({
  ...nameFieldsUpdate,
  gender: z.enum(["male", "female"]).optional(),
  dob: nullableBirthDate,
  relationship: z.enum(RELATIONSHIPS).optional(),
  relationshipOther: nullableRelationshipOther,
  address: nullableText(255),
  careNotes: nullableText(2000),
});

export const CustomerCreateSchema = z
  .object({
    ...nameFields,
    nic: optNic,
    dob: optBirthDate,
    phone,
    altPhone: optPhone,
    email: optEmail,
    address: optAddress,
    city: optCity,
    notes: optText(2000),
    /** Optional: register patients in the same call. */
    patients: z.array(PatientCreateSchema).max(10).optional(),
  })
  .refine((c) => !c.altPhone || c.altPhone !== c.phone, {
    path: ["altPhone"],
    message: "Other phone must be different from the main number.",
  });

export const CustomerUpdateFields = z.object({
  ...nameFieldsUpdate,
  nic: nullableNic,
  dob: nullableBirthDate,
  phone: phone.optional(),
  altPhone: nullablePhone,
  email: nullableEmail,
  address: nullableAddress,
  city: nullableCity,
  notes: nullableText(2000),
});

/** Use after .extend(): Zod can't extend a schema that already has a refine. */
export function altPhoneDiffers(c: { phone?: string; altPhone?: string | null }) {
  return !c.altPhone || !c.phone || c.altPhone !== c.phone;
}
export const ALT_PHONE_ISSUE = {
  path: ["altPhone"],
  message: "Other phone must be different from the main number.",
};

export const CustomerUpdateSchema = CustomerUpdateFields.refine(altPhoneDiffers, ALT_PHONE_ISSUE);

export const CustomerListQuery = z.object({
  /** Searches phone, alt phone, NIC, name and customer no. */
  q: optText(100),
  ...pagination,
});

// ---------------------------------------------------------------- customers
export async function searchCustomers(query: z.infer<typeof CustomerListQuery>): Promise<Paged<unknown>> {
  const where: (SQL | undefined)[] = [];
  if (query.q) {
    // "+94 77 123 4567" finds 0771234567: phones are stored in that normal form.
    const asPhone = normalizePhone(query.q);
    const s = `%${asPhone ?? query.q}%`;
    where.push(
      or(
        like(customers.phone, s),
        like(customers.altPhone, s),
        like(customers.nic, s),
        like(customers.fullName, s),
        like(customers.customerNo, s),
        like(customers.email, s),
      ),
    );
  }
  const { limit, offset } = pageParams(query);
  const [items, [{ total }]] = await Promise.all([
    db
      .select({
        id: customers.id,
        customerNo: customers.customerNo,
        fullName: customers.fullName,
        nic: customers.nic,
        phone: customers.phone,
        altPhone: customers.altPhone,
        city: customers.city,
        patientCount: db.$count(patients, eq(patients.customerId, customers.id)),
      })
      .from(customers)
      .where(and(...where))
      .orderBy(desc(customers.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(customers)
      .where(and(...where)),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

/** Customer profile: details, patients and the 20 most recent bookings. */
export async function getCustomer(customerId: number) {
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
  if (!customer) throw new NotFoundError("Customer");

  const [patientRows, recentBookings] = await Promise.all([
    db.select().from(patients).where(eq(patients.customerId, customerId)).orderBy(patients.fullName),
    db
      .select({
        id: bookings.id,
        bookingNo: bookings.bookingNo,
        serviceDate: bookings.serviceDate,
        status: bookings.status,
        patientId: bookings.patientId,
        patientName: patients.fullName,
        employeeName: employees.fullName,
        rate: bookings.rate,
      })
      .from(bookings)
      .innerJoin(patients, eq(patients.id, bookings.patientId))
      .leftJoin(employees, eq(employees.id, bookings.employeeId))
      .where(eq(bookings.customerId, customerId))
      .orderBy(desc(bookings.serviceDate), desc(bookings.id))
      .limit(20),
  ]);
  return { ...customer, patients: patientRows, recentBookings };
}

export async function createCustomer(input: z.infer<typeof CustomerCreateSchema>, user: CurrentUser) {
  const { patients: newPatients, ...customer } = input;
  const nicDob = checkAgainstNic(customer);
  if (nicDob) customer.dob = nicDob;
  const customerId = await db.transaction(async (tx) => {
    const customerNo = await nextNumber(tx, "customer");
    const [res] = await tx.insert(customers).values({ ...customer, customerNo, createdBy: user.id });
    for (const p of newPatients ?? []) {
      const patientNo = await nextNumber(tx, "patient");
      await tx.insert(patients).values({ ...withRelationshipOther(p), customerId: res.insertId, patientNo });
    }
    return res.insertId;
  });
  return getCustomer(customerId);
}

export async function updateCustomer(customerId: number, input: z.infer<typeof CustomerUpdateSchema>) {
  const saved = await getCustomer(customerId);
  const nicDob = checkAgainstNic(input, saved);
  if (nicDob) input = { ...input, dob: nicDob };
  if (Object.keys(input).length) await db.update(customers).set(input).where(eq(customers.id, customerId));
  return getCustomer(customerId);
}

// ---------------------------------------------------------------- patients
/**
 * "Other" needs the real relationship typed in; any other choice clears it.
 * `saved` = the patient as stored (for updates that send only one of the two fields).
 */
function withRelationshipOther<T extends { relationship?: string; relationshipOther?: string | null }>(
  input: T,
  saved?: { relationship: string; relationshipOther: string | null },
  field = "relationshipOther",
): T {
  const rel = input.relationship ?? saved?.relationship;
  if (rel !== "other") return input.relationship !== undefined || input.relationshipOther !== undefined ? { ...input, relationshipOther: null } : input;
  const other = input.relationshipOther !== undefined ? input.relationshipOther : saved?.relationshipOther;
  if (!other) throw new ValidationError({ [field]: ["Please type the relationship (e.g. Grandmother, Neighbour)."] });
  return input;
}
export async function getPatient(patientId: number) {
  const [row] = await db.select().from(patients).where(eq(patients.id, patientId));
  if (!row) throw new NotFoundError("Patient");
  return row;
}

export async function addPatient(customerId: number, input: z.infer<typeof PatientCreateSchema>) {
  const [customer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId));
  if (!customer) throw new NotFoundError("Customer");
  input = withRelationshipOther(input);
  const patientId = await db.transaction(async (tx) => {
    const patientNo = await nextNumber(tx, "patient");
    const [res] = await tx.insert(patients).values({ ...input, customerId, patientNo });
    return res.insertId;
  });
  return getPatient(patientId);
}

export async function updatePatient(patientId: number, input: z.infer<typeof PatientUpdateSchema>) {
  const saved = await getPatient(patientId);
  input = withRelationshipOther(input, saved);
  if (Object.keys(input).length) await db.update(patients).set(input).where(eq(patients.id, patientId));
  return getPatient(patientId);
}
