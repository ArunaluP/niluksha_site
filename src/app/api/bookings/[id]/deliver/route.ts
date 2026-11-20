import { deliverBooking, NoteSchema } from "@/features/bookings/service";
import { api, readBody, toId } from "@/lib/api";

/** POST /api/bookings/:id/deliver   { note? }   — assigned → delivered + invoice created */
export const POST = api<{ id: string }>({ permission: "markDelivered" }, async ({ req, params, user }) => {
  const { note } = await readBody(req, NoteSchema);
  return deliverBooking(toId(params.id, "Booking"), user, note);
});
