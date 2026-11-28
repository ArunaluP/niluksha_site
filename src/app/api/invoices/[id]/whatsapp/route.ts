import { prepareWhatsappInvoice } from "@/features/invoices/links";
import { api, toId } from "@/lib/api";

/**
 * POST /api/invoices/:id/whatsapp   (invoice must be marked printed)
 * Makes a new 7-day invoice link and returns { number, message, waUrl, link, summary }.
 * Open waUrl to get WhatsApp with the customer's number and the message filled in.
 */
export const POST = api<{ id: string }>({ permission: "printInvoice" }, async ({ params, user }) => prepareWhatsappInvoice(toId(params.id, "Invoice"), user));
