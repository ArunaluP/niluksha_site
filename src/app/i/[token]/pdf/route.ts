import { invoicePdf } from "@/features/invoices/pdf";
import { invoiceForToken } from "@/features/invoices/links";

/**
 * GET /i/:token/pdf   the invoice PDF behind a WhatsApp link (no login).
 * ?download=1 saves it as a file; otherwise it opens in the browser.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await invoiceForToken(token);
  if (r.state !== "ok" || !r.invoice) {
    return new Response("This invoice link has expired or is no longer valid.", {
      status: 410,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
    });
  }
  const pdf = await invoicePdf(r.invoice);
  const download = new URL(req.url).searchParams.get("download") === "1";
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${r.invoice.invoiceNo}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}
