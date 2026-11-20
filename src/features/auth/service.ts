import "server-only";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import * as z from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { clearFailures, isLocked, recordFailure } from "@/lib/rate-limit";
import { createSession } from "@/lib/session";

export const LoginSchema = z.object({
  email: z.email({ error: "Enter a valid email." }).trim().toLowerCase(),
  password: z.string().min(1, { error: "Enter your password." }),
});

// A real bcrypt hash used when the email doesn't exist, so the response takes
// the same time either way (attackers can't tell which emails are registered).
const DUMMY_HASH = "$2b$10$NzZH9.46y7p4Iq2/RZqHt.vhlzh2WkZWyzsUEIzV0RyEQTn4z.ei.";

/** Checks email + password, creates the session cookie, returns the user. */
export async function loginWithPassword(email: string, password: string) {
  if (isLocked(email)) throw new AppError("Too many failed attempts. Try again in 15 minutes.", 429);

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      branchId: users.branchId,
      passwordHash: users.passwordHash,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !passwordOk) {
    recordFailure(email);
    throw new AppError("Invalid email or password.", 401);
  }
  if (!user.isActive) throw new AppError("This account is disabled. Contact the administrator.", 403);

  clearFailures(email);
  await createSession({ userId: user.id, role: user.role, branchId: user.branchId });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  return { id: user.id, name: user.name, email: user.email, role: user.role, branchId: user.branchId };
}
