import { confirmBooking, NoteSchema } from "@/features/bookings/service";
import { api, readBody, toId } from "@/lib/api";

/** POST /api/bookings/:id/confirm   { note? }   — pending → confirmed */
export const POST = api<{ id: string }>({ permission: "useCallList" }, async ({ req, params, user }) => {
  const { note } = await readBody(req, NoteSchema);
  return confirmBooking(toId(params.id, "Booking"), user, note);
});
