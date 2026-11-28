import { disableInvoiceLinks, linkSummary } from "@/features/invoices/links";
import { getInvoice } from "@/features/invoices/service";
import { api, toId } from "@/lib/api";

/** GET /api/invoices/:id/links   { sent, active, activeUntil, views, lastViewed } */
export const GET = api<{ id: string }>({ permission: "viewInvoices" }, async ({ params, user }) => {
  const id = toId(params.id, "Invoice");
  await getInvoice(id, user);
  return linkSummary(id);
});

/** DELETE /api/invoices/:id/links   disable every link sent for this invoice */
export const DELETE = api<{ id: string }>({ permission: "printInvoice" }, async ({ params, user }) => disableInvoiceLinks(toId(params.id, "Invoice"), user));
