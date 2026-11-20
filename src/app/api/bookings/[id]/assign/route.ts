import { AssignSchema, assignEmployee } from "@/features/bookings/service";
import { api, readBody, toId } from "@/lib/api";

/** POST /api/bookings/:id/assign   { employeeId, note? }   — confirmed → assigned, or reassign */
export const POST = api<{ id: string }>({ permission: "assignEmployee" }, async ({ req, params, user }) => {
  const { employeeId, note } = await readBody(req, AssignSchema);
  return assignEmployee(toId(params.id, "Booking"), employeeId, user, note);
});
