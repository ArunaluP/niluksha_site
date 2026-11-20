import "server-only";
import { and, asc, eq, like, or, type SQL } from "drizzle-orm";
import * as z from "zod";
import { db } from "@/db";
import { branches, users } from "@/db/schema";
import { AppError, NotFoundError } from "@/lib/errors";
import { id, nullableText, optText, phone, queryBool, reqText } from "@/lib/validation";

export const BranchCreateSchema = z.object({
  code: reqText(20, "Code").toUpperCase(),
  name: reqText(120, "Name"),
  address: optText(255),
  phone: phone.optional(),
  managerUserId: id.optional(),
  isActive: z.boolean().optional(),
});

export const BranchUpdateSchema = z.object({
  code: reqText(20, "Code").toUpperCase().optional(),
  name: reqText(120, "Name").optional(),
  address: nullableText(255),
  phone: phone.nullable().optional(),
  managerUserId: id.nullable().optional(),
  isActive: z.boolean().optional(),
});

export const BranchListQuery = z.object({
  search: optText(100),
  active: queryBool.optional(),
});

const branchColumns = {
  id: branches.id,
  code: branches.code,
  name: branches.name,
  address: branches.address,
  phone: branches.phone,
  isActive: branches.isActive,
  managerUserId: branches.managerUserId,
  managerName: users.name,
  createdAt: branches.createdAt,
};

export async function listBranches(q: z.infer<typeof BranchListQuery>) {
  const where: (SQL | undefined)[] = [];
  if (q.active !== undefined) where.push(eq(branches.isActive, q.active));
  if (q.search) where.push(or(like(branches.name, `%${q.search}%`), like(branches.code, `%${q.search}%`)));
  return db
    .select(branchColumns)
    .from(branches)
    .leftJoin(users, eq(users.id, branches.managerUserId))
    .where(and(...where))
    .orderBy(asc(branches.name));
}

export async function getBranch(branchId: number) {
  const [row] = await db
    .select(branchColumns)
    .from(branches)
    .leftJoin(users, eq(users.id, branches.managerUserId))
    .where(eq(branches.id, branchId));
  if (!row) throw new NotFoundError("Branch");
  return row;
}

/** The manager must be an active user with the Branch Manager role. */
async function checkManager(managerUserId: number | null | undefined) {
  if (!managerUserId) return;
  const [m] = await db.select({ role: users.role, isActive: users.isActive }).from(users).where(eq(users.id, managerUserId));
  if (!m) throw new AppError("Manager user not found.");
  if (m.role !== "branch_manager") throw new AppError("The manager must be a user with the Branch Manager role.");
  if (!m.isActive) throw new AppError("The selected manager's account is disabled.");
}

export async function createBranch(input: z.infer<typeof BranchCreateSchema>) {
  await checkManager(input.managerUserId);
  const branchId = await db.transaction(async (tx) => {
    const [res] = await tx.insert(branches).values(input);
    // Keep the manager's login linked to this branch.
    if (input.managerUserId) await tx.update(users).set({ branchId: res.insertId }).where(eq(users.id, input.managerUserId));
    return res.insertId;
  });
  return getBranch(branchId);
}

export async function updateBranch(branchId: number, input: z.infer<typeof BranchUpdateSchema>) {
  await getBranch(branchId);
  await checkManager(input.managerUserId);
  await db.transaction(async (tx) => {
    if (Object.keys(input).length) await tx.update(branches).set(input).where(eq(branches.id, branchId));
    if (input.managerUserId) await tx.update(users).set({ branchId }).where(eq(users.id, input.managerUserId));
  });
  return getBranch(branchId);
}
