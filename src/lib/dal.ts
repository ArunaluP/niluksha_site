import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { decrypt, SESSION_COOKIE } from "./session";
import { hasPermission, type Permission } from "./permissions";

/**
 * Data Access Layer — the SECURE auth check.
 * proxy.ts only does a quick cookie check; this file confirms the user still
 * exists and is active in the database. Every page, server action and API route
 * must go through requireUser() / requirePermission() / protectedAction().
 */

export const getSession = cache(async () => {
  const cookieStore = await cookies();
  return decrypt(cookieStore.get(SESSION_COOKIE)?.value);
});

export const getCurrentUser = cache(async () => {
  const session = await getSession();
  if (!session) return null;

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      branchId: users.branchId,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user || !user.isActive) return null;
  return user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** Use in pages/layouts: sends visitors without a valid session to /login. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Use in pages: logged in AND allowed, otherwise /no-access. */
export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasPermission(user, permission)) redirect("/no-access");
  return user;
}
