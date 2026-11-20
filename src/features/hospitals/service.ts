import "server-only";
import { and, asc, eq, like, or, type SQL } from "drizzle-orm";
import * as z from "zod";
import { db } from "@/db";
import { hospitals } from "@/db/schema";
import { NotFoundError } from "@/lib/errors";
import { nullableText, optText, phone, queryBool, reqText } from "@/lib/validation";

const HOSPITAL_TYPES = ["private", "government"] as const;

export const HospitalCreateSchema = z.object({
  name: reqText(150, "Name"),
  type: z.enum(HOSPITAL_TYPES, { error: "Type must be private or government." }),
  address: optText(255),
  city: optText(80),
  phone: phone.optional(),
  isActive: z.boolean().optional(),
});

export const HospitalUpdateSchema = z.object({
  name: reqText(150, "Name").optional(),
  type: z.enum(HOSPITAL_TYPES).optional(),
  address: nullableText(255),
  city: nullableText(80),
  phone: phone.nullable().optional(),
  isActive: z.boolean().optional(),
});

export const HospitalListQuery = z.object({
  type: z.enum(HOSPITAL_TYPES).optional(),
  search: optText(100),
  active: queryBool.optional(),
});

export async function listHospitals(q: z.infer<typeof HospitalListQuery>) {
  const where: (SQL | undefined)[] = [];
  if (q.type) where.push(eq(hospitals.type, q.type));
  if (q.active !== undefined) where.push(eq(hospitals.isActive, q.active));
  if (q.search) where.push(or(like(hospitals.name, `%${q.search}%`), like(hospitals.city, `%${q.search}%`)));
  return db.select().from(hospitals).where(and(...where)).orderBy(asc(hospitals.name));
}

export async function getHospital(hospitalId: number) {
  const [row] = await db.select().from(hospitals).where(eq(hospitals.id, hospitalId));
  if (!row) throw new NotFoundError("Hospital");
  return row;
}

export async function createHospital(input: z.infer<typeof HospitalCreateSchema>) {
  const [res] = await db.insert(hospitals).values(input);
  return getHospital(res.insertId);
}

export async function updateHospital(hospitalId: number, input: z.infer<typeof HospitalUpdateSchema>) {
  await getHospital(hospitalId);
  if (Object.keys(input).length) await db.update(hospitals).set(input).where(eq(hospitals.id, hospitalId));
  return getHospital(hospitalId);
}
