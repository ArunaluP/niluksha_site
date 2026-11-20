import { BookingUpdateSchema, getBooking, updateBooking } from "@/features/bookings/service";
import { api, readBody, toId } from "@/lib/api";

/** GET /api/bookings/:id   (details + status history + invoice) */
export const GET = api<{ id: string }>({ permission: "viewReports" }, async ({ params, user }) => getBooking(toId(params.id, "Booking"), user));

/** PATCH /api/bookings/:id   change details while pending/confirmed */
export const PATCH = api<{ id: string }>({ permission: "createBooking" }, async ({ req, params, user }) =>
  updateBooking(toId(params.id, "Booking"), await readBody(req, BookingUpdateSchema), user),
);
