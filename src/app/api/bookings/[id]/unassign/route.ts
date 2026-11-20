import { unassignEmployee, NoteSchema } from "@/features/bookings/service";
import { api, readBody, toId } from "@/lib/api";

/** POST /api/bookings/:id/unassign   { note? }   — assigned → confirmed */
export const POST = api<{ id: string }>({ permission: "assignEmployee" }, async ({ req, params, user }) => {
  const { note } = await readBody(req, NoteSchema);
  return unassignEmployee(toId(params.id, "Booking"), user, note);
});
