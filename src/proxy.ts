import { NextResponse, type NextRequest } from "next/server";
import { decrypt, SESSION_COOKIE } from "@/lib/session";

/**
 * Route guard (Next.js 16 renamed middleware.ts → proxy.ts).
 * Runs before every page. It ONLY checks the signed cookie (fast, no database):
 *   - not logged in + private page  → /login?next=<page>
 *   - logged in + /login            → /dashboard
 *   - /api/* is passed through: each API route checks the user itself
 * The real security check (user still active, role allowed) happens in
 * src/lib/dal.ts and protectedAction(), close to the data.
 */
const PUBLIC_PATHS = ["/login"];
/** Open to everyone, logged in or not: the invoice links customers get on WhatsApp (/i/<secret>). */
const OPEN_PATHS = ["/i/", "/b/"]; // invoice and booking links sent on WhatsApp

export default async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // API routes answer for themselves with JSON 401/403 (see src/lib/api.ts),
  // so Postman/fetch get a proper error instead of an HTML redirect.
  if (pathname.startsWith("/api/")) return NextResponse.next();
  if (OPEN_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const session = await decrypt(req.cookies.get(SESSION_COOKIE)?.value);

  if (!session && !isPublic) {
    const url = new URL("/login", req.nextUrl);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  if (session && isPublic) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next.js internals and static files (images, icons, fonts).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)"],
};
