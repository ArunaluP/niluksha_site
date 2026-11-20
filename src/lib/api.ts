import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import * as z from "zod";
import { getCurrentUser, type CurrentUser } from "./dal";
import { describeError, NotFoundError, ValidationError } from "./errors";
import { hasPermission, type Permission } from "./permissions";

/**
 * The "middleware" for REST API routes (src/app/api/**).
 * Every route is wrapped in api(...), which:
 *   1. checks the login cookie + that the user is still active   → 401
 *   2. checks the role permission                                → 403
 *   3. runs the handler and returns { ok: true, data }
 *   4. turns errors into JSON: 400 validation, 404, 409 conflict, 500
 *
 *   export const GET = api({ permission: "viewMasterData" }, async ({ req, user }) => {
 *     return listBranches();
 *   });
 */

export type ApiContext<P> = { req: NextRequest; user: CurrentUser; params: P };

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(status: number, error: string, fieldErrors?: Record<string, string[] | undefined>) {
  return NextResponse.json({ ok: false, error, ...(fieldErrors ? { fieldErrors } : {}) }, { status });
}

export function api<P extends Record<string, string> = Record<string, never>>(
  options: { permission?: Permission },
  handler: (ctx: ApiContext<P>) => Promise<unknown>,
) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    try {
      const user = await getCurrentUser();
      if (!user) return fail(401, "Not logged in. Call POST /api/auth/login first.");
      if (options.permission && !hasPermission(user, options.permission)) {
        return fail(403, "You don't have permission to do this.");
      }
      const params = (context?.params ? await context.params : {}) as P;
      const result = await handler({ req, user, params });
      if (result instanceof Response) return result;
      return ok(result ?? null);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  if (err instanceof ValidationError) return fail(400, err.message, err.fieldErrors);
  const { status, message } = describeError(err);
  return fail(status, message);
}

/** Parse + validate a JSON body. Throws ValidationError (→ 400). */
export async function readBody<S extends z.ZodType>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  let json: unknown;
  try {
    const text = await req.text();
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new ValidationError({ body: ["Request body must be valid JSON."] });
  }
  return parseOrThrow(schema, json);
}

/** Parse + validate ?query=string parameters. */
export function readQuery<S extends z.ZodType>(req: NextRequest, schema: S): z.infer<S> {
  const raw: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    if (value !== "") raw[key] = value;
  });
  return parseOrThrow(schema, raw);
}

export function parseOrThrow<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError(z.flattenError(result.error).fieldErrors as Record<string, string[]>);
  }
  return result.data;
}

/** "/api/bookings/12" → 12. Anything else → 404. */
export function toId(value: string | undefined, what = "Record"): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new NotFoundError(what);
  return n;
}
