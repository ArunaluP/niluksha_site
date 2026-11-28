import { prepareWhatsappBooking } from "@/features/bookings/confirmation";
import { api, toId } from "@/lib/api";

/**
 * POST /api/bookings/:id/whatsapp   (any booking except a cancelled one)
 * Makes a new 7-day booking link and returns { number, message, waUrl, link, summary }.
 * Open waUrl to get WhatsApp with the customer's number and the message filled in.
 */
export const POST = api<{ id: string }>({ permission: "createBooking" }, async ({ params, user }) => prepareWhatsappBooking(toId(params.id, "Booking"), user));
