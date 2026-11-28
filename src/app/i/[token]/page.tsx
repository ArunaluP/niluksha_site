import { CalendarDays, Download, FileText, HeartPulse, Link2Off, MapPin, Package, User } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { money, niceDate, nicePeriod, niceTime } from "@/components/ui";
import { invoiceForToken } from "@/features/invoices/links";
import { toIsoDate } from "@/lib/dates";
import { hospitalPlace } from "@/lib/lk-rules";
import { getSettings } from "@/lib/settings";

/**
 * The page a customer opens from the WhatsApp message (no login).
 * Shows only this one invoice, with View PDF / Download PDF buttons.
 */
export const metadata: Metadata = {
  title: "Your invoice",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Link previews (WhatsApp shows one when the message is sent) don't count as the customer opening it. */
const PREVIEW_BOT = /whatsapp|facebookexternalhit|facebot|bot|crawler|spider|preview/i;

export default async function InvoiceLinkPage({ params }: PageProps<"/i/[token]">) {
  const { token } = await params;
  const ua = (await headers()).get("user-agent") ?? "";
  const r = await invoiceForToken(token, { countView: !PREVIEW_BOT.test(ua) });

  if (r.state !== "ok" || !r.invoice) {
    const s = await getSettings();
    return (
      <Shell company={s.company_name}>
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <span className="mb-4 rounded-2xl bg-slate-100 p-3 text-slate-500">
            <Link2Off size={26} />
          </span>
          <h1 className="text-lg font-semibold text-slate-900">{r.state === "expired" ? "This link has expired" : "This link is no longer valid"}</h1>
          <p className="mt-2 max-w-xs text-sm text-slate-500">
            Invoice links work for 7 days. Please contact us for a new one
            {s.company_phone ? (
              <>
                {" "}
                on{" "}
                <a href={`tel:${s.company_phone.replace(/[^\d+]/g, "")}`} className="font-medium text-[#6658f5]">
                  {s.company_phone}
                </a>
              </>
            ) : null}
            .
          </p>
        </div>
      </Shell>
    );
  }

  const inv = r.invoice;
  const where = inv.locationType === "hospital" ? hospitalPlace(inv.hospitalName, inv.wardNo, inv.bedNo) : inv.serviceAddress;
  return (
    <Shell company={inv.company.name} phone={inv.company.phone}>
      <div className="px-6 pb-6 pt-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Invoice</div>
        <div className="mt-0.5 flex items-baseline justify-between gap-3">
          <h1 className="text-xl font-semibold text-slate-900">{inv.invoiceNo}</h1>
          <span className="text-sm text-slate-500">{niceDate(inv.invoiceDate)}</span>
        </div>
        <p className="mt-1 text-sm text-slate-600">Dear {inv.customerName}, thank you for choosing us.</p>

        <dl className="mt-5 space-y-3 rounded-2xl bg-slate-50 p-4 text-sm">
          <Row
            icon={<CalendarDays size={15} />}
            label={inv.days > 1 ? `Service (${inv.days} days)` : "Service date"}
            value={`${nicePeriod(inv.serviceDate, inv.days)}, ${niceTime(inv.startTime)}`}
          />
          <Row icon={<User size={15} />} label="Patient" value={inv.patientName} />
          <Row icon={<Package size={15} />} label="Package" value={inv.packageName || `${inv.durationHours}-hour care session`} />
          {where && <Row icon={<MapPin size={15} />} label={inv.locationType === "hospital" ? "Hospital" : "Home"} value={where} />}
        </dl>

        <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
          <span className="text-sm text-slate-500">Total{inv.days > 1 ? ` (${money(inv.rate)} × ${inv.days} days)` : ""}</span>
          <span className="text-2xl font-semibold text-slate-900">{money(inv.amount)}</span>
        </div>

        <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
          <a
            href={`/i/${token}/pdf?download=1`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#6658f5] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#5546e8]"
          >
            <Download size={17} /> Download PDF
          </a>
          <a
            href={`/i/${token}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <FileText size={17} /> View / print PDF
          </a>
        </div>
        {r.expiresAt && (
          <p className="mt-4 text-center text-xs text-slate-400">
            For your privacy this link works until {niceDate(toIsoDate(r.expiresAt))}. Please save the PDF to keep it.
          </p>
        )}
      </div>
    </Shell>
  );
}

function Shell({ company, phone, children }: { company?: string; phone?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-start justify-center px-4 py-8 sm:items-center">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-[0_24px_70px_-30px_rgba(30,27,75,0.45)]">
        <header className="flex items-center gap-3 border-b border-slate-100 px-6 py-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#6658f5] text-white">
            <HeartPulse size={20} />
          </span>
          <div className="min-w-0">
            <div className="truncate font-semibold text-slate-900">{company || "Care Services"}</div>
            {phone && <div className="text-xs text-slate-500">Tel: {phone}</div>}
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}

function Row({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-[#6658f5]">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className="font-medium text-slate-800">{value}</dd>
      </div>
    </div>
  );
}
