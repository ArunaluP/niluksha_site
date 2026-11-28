import { bookingForToken } from "@/features/bookings/confirmation";
import { bookingPdf } from "@/features/bookings/pdf";

/**
 * GET /b/:token/pdf   the booking confirmation PDF behind a WhatsApp link (no login).
 * ?download=1 saves it as a file; otherwise it opens in the browser.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await bookingForToken(token);
  if (r.state !== "ok" || !r.booking) {
    return new Response("This booking link has expired or is no longer valid.", {
      status: 410,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
    });
  }
  const pdf = await bookingPdf(r.booking);
  const download = new URL(req.url).searchParams.get("download") === "1";
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${r.booking.bookingNo}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}
