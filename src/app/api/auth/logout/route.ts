import { ok } from "@/lib/api";
import { deleteSession } from "@/lib/session";

/** POST /api/auth/logout — clears the session cookie. */
export async function POST() {
  await deleteSession();
  return ok({ loggedOut: true });
}
