"use client";

import { AlertTriangle, Copy, ExternalLink, Link2, Link2Off, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { disableBookingLinksAction, disableInvoiceLinksAction, prepareWhatsappBookingAction, prepareWhatsappInvoiceAction } from "@/app/(app)/_actions/whatsapp";
import { WA_GREEN } from "@/components/app/whatsapp-phone";
import { Button, niceDateTime } from "@/components/ui";
import { Dialog } from "@/components/ui/client";

export type LinkSummary = { sent: number; active: number; activeUntil: string | null; views: number; lastViewed: string | null };
type Prepared = { number: string; message: string; waUrl: string; link: { url: string; expiresAt: string } | null; summary: LinkSummary };

const KINDS = {
  invoice: { prepare: prepareWhatsappInvoiceAction, disable: disableInvoiceLinksAction, word: "invoice" },
  booking: { prepare: prepareWhatsappBookingAction, disable: disableBookingLinksAction, word: "booking" },
} as const;

const NO_LINKS: LinkSummary = { sent: 0, active: 0, activeUntil: null, views: 0, lastViewed: null };

/**
 * "Send on WhatsApp" for an invoice (after it is marked printed) or a booking confirmation.
 * Makes a new 7-day link, shows the message, and opens WhatsApp with the
 * customer's number and the message filled in. Staff press Send in WhatsApp.
 */
export function WhatsappShare({
  kind,
  id: recordId,
  docNo,
  number,
  customerId,
  summary: initialSummary = NO_LINKS,
  size = "md",
}: {
  kind: keyof typeof KINDS;
  id: number;
  docNo: string;
  number: string | null;
  customerId: number;
  summary?: LinkSummary;
  size?: "sm" | "md";
}) {
  const k = KINDS[kind];
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Prepared | null>(null);
  const [summary, setSummary] = useState(initialSummary);
  const [pending, start] = useTransition();

  if (!number) {
    return (
      <Link href={`/customers/${customerId}`} className="inline-flex items-center gap-1.5 self-center text-xs text-muted hover:text-ink" title="Add a WhatsApp number in the customer's profile">
        <MessageCircle size={14} /> No WhatsApp number
      </Link>
    );
  }

  function prepare() {
    setData(null);
    setOpen(true);
    start(async () => {
      const r = await k.prepare({ id: recordId });
      if (!r.ok) {
        toast.error(r.error);
        setOpen(false);
        return;
      }
      setData(r.data);
      setSummary(r.data.summary);
    });
  }

  function disableLinks() {
    if (!window.confirm(`Stop every link sent for ${docNo}? The customer won't be able to open the ${k.word} from WhatsApp any more.`)) return;
    start(async () => {
      const r = await k.disable({ id: recordId });
      if (!r.ok) return void toast.error(r.error);
      setSummary(r.data);
      setData((d) => (d ? { ...d, link: null } : d));
      toast.success(`${kind === "invoice" ? "Invoice" : "Booking"} links disabled`);
    });
  }

  return (
    <>
      <Button type="button" size={size} onClick={prepare} disabled={pending} style={{ background: WA_GREEN }} className="hover:brightness-95">
        <MessageCircle size={16} /> Send on WhatsApp
      </Button>

      {/* "contents": no box of its own, only keeps the dialog's text left-aligned inside centred screens */}
      <div className="contents text-left">
      <Dialog open={open} onClose={() => setOpen(false)} title={`Send ${docNo} on WhatsApp`} subtitle={`To ${number}`}>
        {!data ? (
          <p className="py-8 text-center text-sm text-muted">Preparing the message…</p>
        ) : (
          <div className="space-y-4">
            {!data.link && (
              <div className="flex gap-2.5 rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>
                  The {k.word} link isn&apos;t included because the system has no public web address yet. Add it in{" "}
                  <Link href="/settings" className="font-semibold underline">
                    Settings
                  </Link>{" "}
                  once the system is online.
                </span>
              </div>
            )}

            <div className="rounded-2xl rounded-tr-sm bg-[#dcf8c6] px-4 py-3 text-[13px] leading-relaxed text-slate-800 shadow-sm">
              <pre className="whitespace-pre-wrap break-words font-sans">{data.message}</pre>
            </div>

            <div className="flex flex-wrap gap-2">
              <a
                href={data.waUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => toast.success("WhatsApp opened. Press Send there.")}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm"
                style={{ background: WA_GREEN }}
              >
                <ExternalLink size={16} /> Open WhatsApp
              </a>
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(data.message);
                    toast.success("Message copied");
                  } catch {
                    toast.error("Couldn't copy. Select the text and copy it.");
                  }
                }}
              >
                <Copy size={15} /> Copy message
              </Button>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-indigo-100/70 pt-4 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Link2 size={14} />
            {summary.active > 0
              ? `${summary.active} working link${summary.active > 1 ? "s" : ""} · until ${niceDateTime(summary.activeUntil)}`
              : "No working links"}
            {summary.views > 0 && ` · opened ${summary.views}× (last ${niceDateTime(summary.lastViewed)})`}
          </span>
          {summary.active > 0 && (
            <Button size="sm" variant="secondary" onClick={disableLinks} disabled={pending}>
              <Link2Off size={14} /> Disable links
            </Button>
          )}
        </div>
      </Dialog>
      </div>
    </>
  );
}
