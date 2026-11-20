import { recordPrint } from "@/features/invoices/service";
import { api, toId } from "@/lib/api";

/** POST /api/invoices/:id/print   record one print/download (print_count + 1) */
export const POST = api<{ id: string }>({ permission: "printInvoice" }, async ({ params, user }) => recordPrint(toId(params.id, "Invoice"), user));
