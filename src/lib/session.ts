import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { USER_ROLES, type UserRole } from "@/db/schema";

/**
 * Stateless session: a signed JWT (HS256) stored in an httpOnly cookie.
 * It holds only what is needed to route the user — never passwords or PII.
 * The DAL (src/lib/dal.ts) re-checks the user in the database on every request,
 * so a deactivated user or a role change takes effect immediately.
 */
export const SESSION_COOKIE = "cb_session";
const SESSION_HOURS = 12; // one working day

export type SessionPayload = {
  userId: number;
  role: UserRole;
  branchId: number | null;
};

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set in .env.local and be at least 32 characters long.");
  }
  return new TextEncoder().encode(secret);
}

export async function encrypt(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secretKey());
}

export async function decrypt(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    const { userId, role, branchId } = payload as Partial<SessionPayload>;
    if (typeof userId !== "number" || !USER_ROLES.includes(role as UserRole)) return null;
    return { userId, role: role as UserRole, branchId: typeof branchId === "number" ? branchId : null };
  } catch {
    return null; // expired, tampered or signed with another secret
  }
}

export async function createSession(payload: SessionPayload) {
  const token = await encrypt(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true, // JavaScript in the browser cannot read it
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 60 * 60,
  });
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
