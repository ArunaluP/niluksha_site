import { addLeave, LeaveCreateSchema, listLeaves } from "@/features/employees/service";
import { api, ok, readBody, toId } from "@/lib/api";

/** GET /api/employees/:id/leaves */
export const GET = api<{ id: string }>({ permission: "viewMasterData" }, async ({ params, user }) =>
  listLeaves(toId(params.id, "Employee"), user),
);

/** POST /api/employees/:id/leaves   { fromDate, toDate, reason? } */
export const POST = api<{ id: string }>({ permission: "manageEmployees" }, async ({ req, params, user }) =>
  ok(await addLeave(toId(params.id, "Employee"), await readBody(req, LeaveCreateSchema), user), 201),
);
