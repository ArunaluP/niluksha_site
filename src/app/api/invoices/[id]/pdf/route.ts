import { invoicePdf } from "@/features/invoices/pdf";
import { getInvoice } from "@/features/invoices/service";
import { api, toId } from "@/lib/api";

/** GET /api/invoices/:id/pdf   the invoice as a PDF file (staff; ?inline=1 to open instead of download) */
export const GET = api<{ id: string }>({ permission: "viewInvoices" }, async ({ req, params, user }) => {
  const inv = await getInvoice(toId(params.id, "Invoice"), user);
  const pdf = await invoicePdf(inv);
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${inv.invoiceNo}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
});
