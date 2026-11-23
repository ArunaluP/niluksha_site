import "server-only";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import * as z from "zod";
import { db } from "@/db";
import { packages } from "@/db/schema";
import { AppError, NotFoundError } from "@/lib/errors";
import { money, nullableText, optText, queryBool, reqText } from "@/lib/validation";

/**
 * Care packages: a name, how many hours (1–24) and a fixed price.
 * The booking copies name / hours / price when it is created, so editing a
 * package later never changes existing bookings or invoices.
 * Exactly one package is the default (pre-selected on new bookings).
 */
const hours = z.coerce
  .number({ error: "Hours must be a number." })
  .int({ error: "Hours must be a whole number." })
  .min(1, { error: "A package is at least 1 hour." })
  .max(24, { error: "A package can be at most 24 hours (one booking per caregiver per day)." });

export const PackageCreateSchema = z.object({
  name: reqText(80, "Package name"),
  durationHours: hours,
  price: money,
  description: optText(255),
  isDefault: z.boolean().optional(),
});

export const PackageUpdateSchema = z.object({
  name: reqText(80, "Package name").optional(),
  durationHours: hours.optional(),
  price: money.optional(),
  description: nullableText(255),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const PackageListQuery = z.object({ active: queryBool.optional() });

export async function listPackages(q: z.infer<typeof PackageListQuery> = {}) {
  return db
    .select()
    .from(packages)
    .where(q.active === undefined ? undefined : eq(packages.isActive, q.active))
    .orderBy(desc(packages.isDefault), desc(packages.isActive), asc(packages.durationHours), asc(packages.name));
}

export async function getPackage(packageId: number) {
  const [row] = await db.select().from(packages).where(eq(packages.id, packageId));
  if (!row) throw new NotFoundError("Package");
  return row;
}

/** The package a booking uses: the chosen one (must be active), else the default. */
export async function packageForBooking(packageId?: number | null) {
  if (packageId) {
    const p = await getPackage(packageId).catch(() => null);
    if (!p) throw new AppError("Package not found.");
    if (!p.isActive) throw new AppError(`The package "${p.name}" is no longer offered. Choose another package.`);
    return p;
  }
  const [def] = await db.select().from(packages).where(and(eq(packages.isDefault, true), eq(packages.isActive, true)));
  if (!def) throw new AppError("Choose a package for this booking (no default package is set).");
  return def;
}

export async function createPackage(input: z.infer<typeof PackageCreateSchema>) {
  const id = await db.transaction(async (tx) => {
    const any = await tx.select({ id: packages.id }).from(packages).limit(1);
    const makeDefault = input.isDefault || any.length === 0; // the first package is always the default
    if (makeDefault) await tx.update(packages).set({ isDefault: false });
    const [res] = await tx.insert(packages).values({ ...input, isDefault: makeDefault });
    return res.insertId;
  });
  return getPackage(id);
}

export async function updatePackage(packageId: number, input: z.infer<typeof PackageUpdateSchema>) {
  const current = await getPackage(packageId);
  const becomesDefault = input.isDefault === true && !current.isDefault;

  if (current.isDefault && input.isDefault === false) {
    throw new AppError("This is the default package. Make another package the default instead.");
  }
  if ((current.isDefault || becomesDefault) && input.isActive === false) {
    throw new AppError("The default package can't be made inactive. Make another package the default first.");
  }
  if (becomesDefault && current.isActive === false && input.isActive !== true) {
    throw new AppError("An inactive package can't be the default. Make it active too.");
  }

  await db.transaction(async (tx) => {
    if (becomesDefault) await tx.update(packages).set({ isDefault: false }).where(ne(packages.id, packageId));
    if (Object.keys(input).length) await tx.update(packages).set(input).where(eq(packages.id, packageId));
  });
  return getPackage(packageId);
}
