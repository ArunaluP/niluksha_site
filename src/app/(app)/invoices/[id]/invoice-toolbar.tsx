"use client";

import { ArrowLeft, CheckCheck, FileDown, Printer } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { markInvoicePrintedAction, recordPrintAction } from "@/app/(app)/_actions/bookings";
import { Button, buttonClass, StatusBadge } from "@/components/ui";

export function InvoiceToolbar({ id, invoiceNo, status, canPrint, whatsapp }: { id: number; invoiceNo: string; status: string; canPrint: boolean; whatsapp?: ReactNode }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Link href="/invoices" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <ArrowLeft size={15} /> Invoices
        </Link>
        <StatusBadge status={status} />
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={`/api/invoices/${id}/pdf`} className={buttonClass("secondary", "md")} title="Download the invoice as a PDF file">
          <FileDown size={16} /> PDF
        </a>
        {canPrint && (
          <>
          <Button
            variant="secondary"
            onClick={() =>
              start(async () => {
                await recordPrintAction({ id });
                window.print();
                router.refresh();
              })
            }
            disabled={pending}
          >
            <Printer size={16} /> Print / Save PDF
          </Button>
          {status === "generated" && (
            <Button
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`Mark ${invoiceNo} as printed and handed over? This closes the booking.`)) return;
                start(async () => {
                  const r = await markInvoicePrintedAction({ id });
                  if (r.ok) {
                    toast.success(`${invoiceNo} marked printed`);
                    router.refresh();
                  } else toast.error(r.error);
                });
              }}
            >
              <CheckCheck size={16} /> Mark printed
            </Button>
          )}
          {status === "printed" && whatsapp}
          </>
        )}
      </div>
    </div>
  );
}
