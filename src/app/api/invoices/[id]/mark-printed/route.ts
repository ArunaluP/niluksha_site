import { markInvoicePrinted } from "@/features/invoices/service";
import { NoteSchema } from "@/features/bookings/service";
import { api, readBody, toId } from "@/lib/api";

/** POST /api/invoices/:id/mark-printed   { note? }   — invoice printed + booking closed (invoice_printed) */
export const POST = api<{ id: string }>({ permission: "printInvoice" }, async ({ req, params, user }) => {
  const { note } = await readBody(req, NoteSchema);
  return markInvoicePrinted(toId(params.id, "Invoice"), user, note);
});
