import { ignoreBooking, NoteSchema } from "@/features/bookings/service";
import { api, readBody, toId } from "@/lib/api";

/** POST /api/bookings/:id/ignore   { note? }   — pending/confirmed/assigned → ignored (frees the employee) */
export const POST = api<{ id: string }>({ permission: "useCallList" }, async ({ req, params, user }) => {
  const { note } = await readBody(req, NoteSchema);
  return ignoreBooking(toId(params.id, "Booking"), user, note);
});
