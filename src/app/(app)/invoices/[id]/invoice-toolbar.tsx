"use client";

import { ArrowLeft, CheckCheck, Printer } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { markInvoicePrintedAction, recordPrintAction } from "@/app/(app)/_actions/bookings";
import { Button, StatusBadge } from "@/components/ui";

export function InvoiceToolbar({ id, invoiceNo, status, canPrint }: { id: number; invoiceNo: string; status: string; canPrint: boolean }) {
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
      {canPrint && (
        <div className="flex gap-2">
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
        </div>
      )}
    </div>
  );
}
