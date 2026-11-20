import "server-only";
import bcrypt from "bcryptjs";
import { and, asc, eq, like, or, type SQL } from "drizzle-orm";
import * as z from "zod";
import { db } from "@/db";
import { branches, USER_ROLES, users } from "@/db/schema";
import type { CurrentUser } from "@/lib/dal";
import { AppError, NotFoundError } from "@/lib/errors";
import { id, optText, queryBool, reqText } from "@/lib/validation";

const password = z.string().min(8, { error: "Password must be at least 8 characters." }).max(72);

export const UserCreateSchema = z
  .object({
    name: reqText(120, "Name"),
    email: z.email({ error: "Enter a valid email." }).trim().toLowerCase(),
    password,
    role: z.enum(USER_ROLES),
    branchId: id.nullable().optional(),
  })
  .refine((u) => u.role !== "branch_manager" || u.branchId, {
    error: "A Branch Manager must have a branch.",
    path: ["branchId"],
  });

export const UserUpdateSchema = z.object({
  name: reqText(120, "Name").optional(),
  email: z.email().trim().toLowerCase().optional(),
  password: password.optional(), // send to reset the password
  role: z.enum(USER_ROLES).optional(),
  branchId: id.nullable().optional(),
  isActive: z.boolean().optional(),
});

export const UserListQuery = z.object({
  role: z.enum(USER_ROLES).optional(),
  search: optText(100),
  active: queryBool.optional(),
});

const userColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  branchId: users.branchId,
  branchName: branches.name,
  isActive: users.isActive,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
}; // never select password_hash here

export async function listUsers(q: z.infer<typeof UserListQuery>) {
  const where: (SQL | undefined)[] = [];
  if (q.role) where.push(eq(users.role, q.role));
  if (q.active !== undefined) where.push(eq(users.isActive, q.active));
  if (q.search) where.push(or(like(users.name, `%${q.search}%`), like(users.email, `%${q.search}%`)));
  return db
    .select(userColumns)
    .from(users)
    .leftJoin(branches, eq(branches.id, users.branchId))
    .where(and(...where))
    .orderBy(asc(users.name));
}

export async function getUser(userId: number) {
  const [row] = await db.select(userColumns).from(users).leftJoin(branches, eq(branches.id, users.branchId)).where(eq(users.id, userId));
  if (!row) throw new NotFoundError("User");
  return row;
}

export async function createUser(input: z.infer<typeof UserCreateSchema>) {
  const passwordHash = await bcrypt.hash(input.password, 10);
  const [res] = await db.insert(users).values({
    name: input.name,
    email: input.email,
    passwordHash,
    role: input.role,
    branchId: input.branchId ?? null,
  });
  return getUser(res.insertId);
}

export async function updateUser(userId: number, input: z.infer<typeof UserUpdateSchema>, actor: CurrentUser) {
  const current = await getUser(userId);
  if (userId === actor.id && (input.isActive === false || (input.role && input.role !== "admin"))) {
    throw new AppError("You cannot disable your own account or remove your own admin role.");
  }
  const role = input.role ?? current.role;
  const branchId = input.branchId !== undefined ? input.branchId : current.branchId;
  if (role === "branch_manager" && !branchId) throw new AppError("A Branch Manager must have a branch.");

  const { password: newPassword, ...rest } = input;
  const set: Partial<typeof users.$inferInsert> = { ...rest };
  if (newPassword) set.passwordHash = await bcrypt.hash(newPassword, 10);
  if (Object.keys(set).length) await db.update(users).set(set).where(eq(users.id, userId));
  return getUser(userId);
}
