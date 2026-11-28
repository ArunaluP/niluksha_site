import { bookingLinkSummary, disableBookingLinks, getBookingConfirmation } from "@/features/bookings/confirmation";
import { api, toId } from "@/lib/api";

/** GET /api/bookings/:id/links   { sent, active, activeUntil, views, lastViewed } */
export const GET = api<{ id: string }>({ permission: "viewReports" }, async ({ params, user }) => {
  const id = toId(params.id, "Booking");
  await getBookingConfirmation(id, user);
  return bookingLinkSummary(id);
});

/** DELETE /api/bookings/:id/links   disable every link sent for this booking */
export const DELETE = api<{ id: string }>({ permission: "createBooking" }, async ({ params, user }) => disableBookingLinks(toId(params.id, "Booking"), user));
