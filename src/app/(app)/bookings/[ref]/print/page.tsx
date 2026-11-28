import { ArrowLeft, FileDown, HeartPulse } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass, money, niceDate, nicePeriod, niceTime } from "@/components/ui";
import { WhatsappShare } from "@/components/app/whatsapp-share";
import { bookingLinkSummary, getBookingConfirmation, placeOf, STATUS_TITLE, statusLine } from "@/features/bookings/confirmation";
import { getBookingByNo } from "@/features/bookings/service";
import { requirePermission } from "@/lib/dal";
import { toIsoDate } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { hasPermission } from "@/lib/permissions";
import { PrintButton } from "./print-button";

export const metadata = { title: "Booking confirmation · Care Booking" };

/** Printable booking confirmation for the customer (A4, like the invoice). */
export default async function BookingPrintPage({ params }: PageProps<"/bookings/[ref]/print">) {
  const user = await requirePermission("viewReports");
  const ref = decodeURIComponent((await params).ref);
  const found = await getBookingByNo(ref, user).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [b, summary] = await Promise.all([getBookingConfirmation(found.id, user), bookingLinkSummary(found.id)]);
  const where = placeOf(b, ", ");
  const showCaregiver = b.employeeName && !["pending", "confirmed"].includes(b.status);

  return (
    <div className="mx-auto max-w-[820px]">
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/bookings/${b.bookingNo}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <ArrowLeft size={15} /> {b.bookingNo}
        </Link>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/bookings/${b.id}/pdf`} className={buttonClass("secondary", "md")} title="Download the booking as a PDF file">
            <FileDown size={16} /> PDF
          </a>
          <PrintButton />
          {hasPermission(user, "createBooking") && b.status !== "ignored" && (
            <WhatsappShare
              kind="booking"
              id={b.id}
              docNo={b.bookingNo}
              customerId={b.customerId}
              number={b.whatsappNumber}
              summary={{ ...summary, activeUntil: summary.activeUntil?.toISOString() ?? null, lastViewed: summary.lastViewed?.toISOString() ?? null }}
            />
          )}
        </div>
      </div>

      <article className="rounded-md bg-white px-12 py-12 text-[13px] text-slate-800 shadow-[0_20px_60px_-25px_rgba(30,27,75,0.35)] print:rounded-none print:px-0 print:py-0 print:shadow-none">
        {/* Header */}
        <header className="flex items-start justify-between border-b border-slate-200 pb-8">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#6658f5] text-white">
              <HeartPulse size={22} />
            </span>
            <div>
              <div className="text-lg font-semibold text-slate-900">{b.company.name || "Care Services"}</div>
              {b.company.address && <div className="text-slate-500">{b.company.address}</div>}
              {b.company.phone && <div className="text-slate-500">Tel: {b.company.phone}</div>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-light tracking-[0.2em] text-slate-900">BOOKING</div>
            <div className="text-[11px] tracking-[0.2em] text-slate-500">CONFIRMATION</div>
            <div className="mt-2 font-semibold">{b.bookingNo}</div>
            <div className="text-slate-500">Booked: {niceDate(toIsoDate(b.bookedOn))}</div>
          </div>
        </header>

        {/* Status */}
        <section className="border-b border-slate-100 py-5">
          <div className="flex items-baseline gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Status</span>
            <span className="font-semibold text-[#6658f5]">{STATUS_TITLE[b.status] ?? b.status}</span>
          </div>
          <p className="mt-1 text-slate-600">{statusLine(b)}</p>
        </section>

        {/* Customer / booking */}
        <section className="grid grid-cols-2 gap-8 py-7">
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Customer</div>
            <div className="font-semibold text-slate-900">{b.customerName}</div>
            <div className="text-slate-500">{b.customerNo}</div>
            {b.customerAddress && <div className="text-slate-600">{b.customerAddress}</div>}
            <div className="text-slate-600">{[b.customerPhone, b.customerAltPhone].filter(Boolean).join(" / ")}</div>
          </div>
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Booking</div>
            <div>
              <span className="text-slate-500">Patient:</span> {b.patientName}
            </div>
            {showCaregiver && (
              <div>
                <span className="text-slate-500">Caregiver:</span> {b.employeeName}
              </div>
            )}
            {b.branchName && (
              <div>
                <span className="text-slate-500">Branch:</span> {b.branchName}
              </div>
            )}
          </div>
        </section>

        {/* Service */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-500">
              <th className="py-3 font-semibold">Service</th>
              <th className="py-3 pl-6 text-right font-semibold">Days</th>
              <th className="py-3 pl-6 text-right font-semibold">Rate</th>
              <th className="py-3 pl-6 text-right font-semibold">Estimate</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-200 align-top">
              <td className="py-4 pr-4">
                <div className="font-semibold text-slate-900">
                  {b.packageName ? `${b.packageName} · ` : ""}
                  {b.durationHours}-hour care session
                </div>
                <div className="mt-0.5 text-slate-500">
                  {nicePeriod(b.serviceDate, b.days)} from {niceTime(b.startTime)}
                  {b.days > 1 ? " each day" : ""} · {b.locationType === "hospital" ? "Hospital" : "Home"}: {where}
                </div>
              </td>
              <td className="py-4 pl-6 text-right">{b.days}</td>
              <td className="whitespace-nowrap py-4 pl-6 text-right">{money(b.rate)}</td>
              <td className="whitespace-nowrap py-4 pl-6 text-right font-semibold text-slate-900">{money(b.estimate)}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-6 flex flex-col items-end">
          <div className="flex w-72 items-baseline justify-between text-base font-semibold text-slate-900">
            <span>Estimated amount</span>
            <span>{money(b.estimate)}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">The final amount is shown on your invoice after the service.</p>
        </div>

        {b.notes && (
          <section className="mt-8">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Notes</div>
            <p className="whitespace-pre-line text-slate-700">{b.notes}</p>
          </section>
        )}

        <footer className="mt-16 border-t border-slate-200 pt-5 text-xs text-slate-500">
          <p>Thank you for choosing {b.company.name || "our services"}.</p>
          {b.company.phone && <p>To change or cancel this booking, please call {b.company.phone}.</p>}
        </footer>
      </article>
    </div>
  );
}
