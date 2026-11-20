import { HeartPulse } from "lucide-react";
import { notFound } from "next/navigation";
import { money, niceDate, niceTime } from "@/components/ui";
import { getInvoice } from "@/features/invoices/service";
import { requirePermission } from "@/lib/dal";
import { NotFoundError } from "@/lib/errors";
import { hasPermission } from "@/lib/permissions";
import { InvoiceToolbar } from "./invoice-toolbar";

export const metadata = { title: "Invoice · Care Booking" };

/** Printable invoice: plain white A4 page (no glass), the app chrome is hidden when printing. */
export default async function InvoicePage({ params }: PageProps<"/invoices/[id]">) {
  const user = await requirePermission("viewInvoices");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const inv = await getInvoice(id, user).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });

  const where = inv.locationType === "hospital" ? `${inv.hospitalName}${inv.wardRoom ? `, ${inv.wardRoom}` : ""}` : inv.serviceAddress;

  return (
    <div className="mx-auto max-w-[820px]">
      <InvoiceToolbar id={inv.id} invoiceNo={inv.invoiceNo} status={inv.status} canPrint={hasPermission(user, "printInvoice")} />

      <article className="rounded-md bg-white px-12 py-12 text-[13px] text-slate-800 shadow-[0_20px_60px_-25px_rgba(30,27,75,0.35)] print:rounded-none print:px-0 print:py-0 print:shadow-none">
        {/* Header */}
        <header className="flex items-start justify-between border-b border-slate-200 pb-8">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#6658f5] text-white print:bg-[#6658f5]">
              <HeartPulse size={22} />
            </span>
            <div>
              <div className="text-lg font-semibold text-slate-900">{inv.company.name || "Care Services"}</div>
              {inv.company.address && <div className="text-slate-500">{inv.company.address}</div>}
              {inv.company.phone && <div className="text-slate-500">Tel: {inv.company.phone}</div>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-light tracking-[0.2em] text-slate-900">INVOICE</div>
            <div className="mt-2 font-semibold">{inv.invoiceNo}</div>
            <div className="text-slate-500">Date: {niceDate(inv.invoiceDate)}</div>
          </div>
        </header>

        {/* Bill to / service */}
        <section className="grid grid-cols-2 gap-8 py-8">
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Bill to</div>
            <div className="font-semibold text-slate-900">{inv.customerName}</div>
            <div className="text-slate-500">{inv.customerNo}</div>
            {inv.customerAddress && <div className="text-slate-600">{inv.customerAddress}</div>}
            <div className="text-slate-600">{inv.customerPhone}</div>
          </div>
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Service</div>
            <div>
              <span className="text-slate-500">Booking:</span> {inv.bookingNo}
            </div>
            <div>
              <span className="text-slate-500">Patient:</span> {inv.patientName}
            </div>
            <div>
              <span className="text-slate-500">Caregiver:</span> {inv.employeeName ?? "—"} {inv.employeeNo ? `(${inv.employeeNo})` : ""}
            </div>
            <div>
              <span className="text-slate-500">Branch:</span> {inv.branchName}
            </div>
          </div>
        </section>

        {/* Lines */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-500">
              <th className="py-3 font-semibold">Description</th>
              <th className="py-3 text-right font-semibold">Qty</th>
              <th className="py-3 text-right font-semibold">Rate</th>
              <th className="py-3 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100 align-top">
              <td className="py-4 pr-4">
                <div className="font-medium text-slate-900">{inv.durationHours}-hour care session</div>
                <div className="mt-0.5 text-slate-500">
                  {niceDate(inv.serviceDate)} from {niceTime(inv.startTime)} · {inv.locationType === "hospital" ? "Hospital" : "Home"}: {where}
                </div>
              </td>
              <td className="py-4 text-right">{Number(inv.qty)}</td>
              <td className="py-4 text-right">{money(inv.rate)}</td>
              <td className="py-4 text-right font-medium">{money(inv.amount)}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-6 flex justify-end">
          <div className="w-64 space-y-2">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>{money(inv.amount)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
              <span>Total</span>
              <span>{money(inv.amount)}</span>
            </div>
          </div>
        </div>

        <footer className="mt-16 flex items-end justify-between border-t border-slate-200 pt-6 text-xs text-slate-500">
          <div>Thank you for choosing {inv.company.name || "our services"}.</div>
          <div className="text-center">
            <div className="mb-1 h-10 w-44 border-b border-slate-300" />
            Authorised signature
          </div>
        </footer>
      </article>
    </div>
  );
}
