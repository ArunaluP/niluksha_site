import { InvoiceListQuery, listInvoices } from "@/features/invoices/service";
import { api, readQuery } from "@/lib/api";

/** GET /api/invoices?status=generated|printed&from=&to=&branchId=&customerId=&q=&page=&pageSize= */
export const GET = api({ permission: "viewInvoices" }, async ({ req, user }) => listInvoices(readQuery(req, InvoiceListQuery), user));
