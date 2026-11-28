import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { authUrl } from "@/features/drive/service";
import { getCurrentUser } from "@/lib/dal";
import { describeError } from "@/lib/errors";
import { hasPermission } from "@/lib/permissions";

/**
 * GET /api/google/connect   (Director, from Settings → "Connect Google Drive")
 * Sends the browser to Google's sign-in / "Allow" page. A random `state` is kept
 * in a short-lived cookie and checked on the way back (stops forged callbacks).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (!hasPermission(user, "manageSettings")) return NextResponse.redirect(new URL("/no-access", req.url));
  try {
    const state = randomBytes(24).toString("base64url");
    const res = NextResponse.redirect(authUrl(state, req.nextUrl.origin));
    res.cookies.set("gdrive_state", state, { httpOnly: true, sameSite: "lax", secure: req.nextUrl.protocol === "https:", path: "/api/google", maxAge: 600 });
    return res;
  } catch (e) {
    return NextResponse.redirect(new URL(`/settings?drive=error&msg=${encodeURIComponent(describeError(e).message)}`, req.url));
  }
}
