"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { disableBookingLinks, prepareWhatsappBooking } from "@/features/bookings/confirmation";
import { disableInvoiceLinks, prepareWhatsappInvoice } from "@/features/invoices/links";
import { protectedAction } from "@/lib/action";
import { id } from "@/lib/validation";

/** Invoice → "Send on WhatsApp": a new 7-day link + the message + the wa.me address. */
export const prepareWhatsappInvoiceAction = protectedAction({ permission: "printInvoice", schema: z.object({ id }) }, async ({ id }, user) => {
  const r = await prepareWhatsappInvoice(id, user);
  return {
    ...r,
    summary: { ...r.summary, activeUntil: r.summary.activeUntil?.toISOString() ?? null, lastViewed: r.summary.lastViewed?.toISOString() ?? null },
  };
});

/** Invoice → "Disable links": every link sent for this invoice stops working now. */
export const disableInvoiceLinksAction = protectedAction({ permission: "printInvoice", schema: z.object({ id }) }, async ({ id }, user) => {
  const s = await disableInvoiceLinks(id, user);
  revalidatePath(`/invoices/${id}`);
  return { ...s, activeUntil: s.activeUntil?.toISOString() ?? null, lastViewed: s.lastViewed?.toISOString() ?? null };
});

/** Booking → "Send on WhatsApp": a new 7-day booking link + the message + the wa.me address. */
export const prepareWhatsappBookingAction = protectedAction({ permission: "createBooking", schema: z.object({ id }) }, async ({ id }, user) => {
  const r = await prepareWhatsappBooking(id, user);
  return {
    ...r,
    summary: { ...r.summary, activeUntil: r.summary.activeUntil?.toISOString() ?? null, lastViewed: r.summary.lastViewed?.toISOString() ?? null },
  };
});

/** Booking → "Disable links": every link sent for this booking stops working now. */
export const disableBookingLinksAction = protectedAction({ permission: "createBooking", schema: z.object({ id }) }, async ({ id }, user) => {
  const s = await disableBookingLinks(id, user);
  return { ...s, activeUntil: s.activeUntil?.toISOString() ?? null, lastViewed: s.lastViewed?.toISOString() ?? null };
});
