import { NextResponse, type NextRequest } from "next/server";
import { completeConnect } from "@/features/drive/service";
import { getCurrentUser } from "@/lib/dal";
import { describeError } from "@/lib/errors";
import { hasPermission } from "@/lib/permissions";

/**
 * GET /api/google/callback?code=…&state=…
 * Google sends the Director back here after "Allow". We check the state cookie,
 * swap the code for a refresh token (stored encrypted) and return to Settings.
 */
export async function GET(req: NextRequest) {
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/settings?${q}`, req.url));
    res.cookies.delete({ name: "gdrive_state", path: "/api/google" });
    return res;
  };
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (!hasPermission(user, "manageSettings")) return NextResponse.redirect(new URL("/no-access", req.url));

  const p = req.nextUrl.searchParams;
  if (p.get("error")) return back(`drive=error&msg=${encodeURIComponent(p.get("error") === "access_denied" ? "Google access was not allowed." : `Google said: ${p.get("error")}`)}`);
  const state = req.cookies.get("gdrive_state")?.value;
  if (!state || state !== p.get("state")) return back(`drive=error&msg=${encodeURIComponent("The Google sign-in expired or didn't start here. Click Connect again.")}`);
  const code = p.get("code");
  if (!code) return back(`drive=error&msg=${encodeURIComponent("Google didn't send a sign-in code.")}`);

  try {
    const email = await completeConnect(code, req.nextUrl.origin, user);
    return back(`drive=connected&account=${encodeURIComponent(email)}`);
  } catch (e) {
    return back(`drive=error&msg=${encodeURIComponent(describeError(e).message)}`);
  }
}
