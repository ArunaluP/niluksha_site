import type { NextRequest } from "next/server";
import { LoginSchema, loginWithPassword } from "@/features/auth/service";
import { errorResponse, ok, readBody } from "@/lib/api";

/**
 * POST /api/auth/login   { "email": "...", "password": "..." }
 * Sets the cb_session cookie (Postman keeps it automatically).
 */
export async function POST(req: NextRequest) {
  try {
    const { email, password } = await readBody(req, LoginSchema);
    const user = await loginWithPassword(email, password);
    return ok(user);
  } catch (err) {
    return errorResponse(err);
  }
}
