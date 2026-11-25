import { getBookingJourney } from "@/features/bookings/journey";
import { api } from "@/lib/api";

/**
 * GET /api/bookings/:id/journey   (the booking's whole flow: milestones, every event, durations)
 * :id is the numeric id or the booking number (BK-2026-00018). Other branches → 404.
 */
export const GET = api<{ id: string }>({ permission: "viewReports" }, async ({ params, user }) => getBookingJourney(params.id ?? "", user));
