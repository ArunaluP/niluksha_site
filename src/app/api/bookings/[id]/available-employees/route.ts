import { getAvailableForBooking } from "@/features/bookings/service";
import { api, toId } from "@/lib/api";

/** GET /api/bookings/:id/available-employees   free employees on the booking's dates (branch managers: own branch only) */
export const GET = api<{ id: string }>({ permission: "assignEmployee" }, async ({ params, user }) =>
  getAvailableForBooking(toId(params.id, "Booking"), user),
);
