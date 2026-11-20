import { getInvoice } from "@/features/invoices/service";
import { api, toId } from "@/lib/api";

/** GET /api/invoices/:id   everything needed to print (company, customer, patient, employee…) */
export const GET = api<{ id: string }>({ permission: "viewInvoices" }, async ({ params, user }) => getInvoice(toId(params.id, "Invoice"), user));
