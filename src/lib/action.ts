import "server-only";
import { unstable_rethrow } from "next/navigation";
import * as z from "zod";
import { getCurrentUser, type CurrentUser } from "./dal";
import { hasPermission, type Permission } from "./permissions";
import { toUserMessage, ValidationError } from "./errors";

/**
 * Standard result every server action returns, so forms can show
 * a message and per-field errors in one consistent way.
 */
export type ActionResult<T = null> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

/**
 * The "middleware" for server actions. In one wrapper it:
 *   1. checks the user is logged in and still active (DB check)
 *   2. checks the role has the permission
 *   3. validates input with Zod (FormData or a plain object)
 *   4. runs your handler and converts errors to friendly messages
 *
 * Usage (in a "use server" file):
 *   export const createBranch = protectedAction(
 *     { permission: "manageBranches", schema: BranchSchema },
 *     async (input, user) => { ...; return { id } }
 *   );
 */
export function protectedAction<S extends z.ZodType, R>(
  options: { permission: Permission; schema: S },
  handler: (input: z.infer<S>, user: CurrentUser) => Promise<R>,
) {
  return async (input: z.input<S> | FormData): Promise<ActionResult<R>> => {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "Your session has expired. Please log in again." };
    if (!hasPermission(user, options.permission)) {
      return { ok: false, error: "You don't have permission to do this." };
    }

    const raw = input instanceof FormData ? formDataToObject(input) : input;
    const parsed = options.schema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Please check the highlighted fields.",
        fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
      };
    }

    try {
      const data = await handler(parsed.data, user);
      return { ok: true, data };
    } catch (err) {
      unstable_rethrow(err); // let redirect()/notFound() work inside handlers
      if (err instanceof ValidationError) return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
      return { ok: false, error: toUserMessage(err) };
    }
  };
}

/** Empty strings become undefined so optional Zod fields behave as expected. */
function formDataToObject(fd: FormData) {
  const obj: Record<string, unknown> = {};
  for (const [key, value] of fd.entries()) {
    if (key.startsWith("$ACTION")) continue; // Next.js internal fields
    obj[key] = value === "" ? undefined : value;
  }
  return obj;
}
