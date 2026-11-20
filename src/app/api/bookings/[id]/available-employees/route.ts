import { getAvailableForBooking } from "@/features/bookings/service";
import { api, toId } from "@/lib/api";

/** GET /api/bookings/:id/available-employees   free employees (all branches) on the booking's date */
export const GET = api<{ id: string }>({ permission: "assignEmployee" }, async ({ params }) =>
  getAvailableForBooking(toId(params.id, "Booking")),
);
