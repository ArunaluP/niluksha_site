import { getBookingConfirmation } from "@/features/bookings/confirmation";
import { bookingPdf } from "@/features/bookings/pdf";
import { api, toId } from "@/lib/api";

/** GET /api/bookings/:id/pdf   the booking confirmation as a PDF file (?inline=1 to open instead of download) */
export const GET = api<{ id: string }>({ permission: "viewReports" }, async ({ req, params, user }) => {
  const b = await getBookingConfirmation(toId(params.id, "Booking"), user);
  const pdf = await bookingPdf(b);
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${b.bookingNo}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
});
