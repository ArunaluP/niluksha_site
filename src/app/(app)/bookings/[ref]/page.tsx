import { asc, eq } from "drizzle-orm";
import { ArrowLeft, FileText, Printer } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AssignButton, ConfirmButton, IgnoreButton } from "@/components/app/booking-actions";
import { BookingJourney } from "@/components/app/booking-journey";
import { WhatsappShare } from "@/components/app/whatsapp-share";
import { LinkButton, niceDate } from "@/components/ui";
import { ActionButton } from "@/components/ui/client";
import { db } from "@/db";
import { customers, hospitals, patients } from "@/db/schema";
import { bookingLinkSummary, loadBookingConfirmation } from "@/features/bookings/confirmation";
import { getBookingJourney } from "@/features/bookings/journey";
import { getBooking, getBookingByNo } from "@/features/bookings/service";
import { listPackages } from "@/features/packages/service";
import { requirePermission } from "@/lib/dal";
import { today } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { hasPermission } from "@/lib/permissions";
import { deliverBookingAction, unassignEmployeeAction } from "../../_actions/bookings";
import { EditBookingButton } from "./edit-booking";

export const metadata = { title: "Booking · Care Booking" };

const BOOKING_NO = /^BK-\d{4}-\d{5}$/i;
/** Only our own Reports page may be the "Back" target (no open redirects). */
const SAFE_BACK = /^\/reports(?:[/?#]|$)/;

const notFoundIfMissing = (e: unknown): never => {
  if (e instanceof NotFoundError) notFound();
  throw e;
};

function queryString(sp: Record<string, string | string[] | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) for (const one of Array.isArray(v) ? v : v === undefined ? [] : [v]) p.append(k, one);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/**
 * /bookings/BK-2026-00018 — the booking's journey + its details and actions.
 * Old links (/bookings/12) redirect here, keeping the query string.
 */
export default async function BookingDetailPage({ params, searchParams }: PageProps<"/bookings/[ref]">) {
  const user = await requirePermission("viewReports");
  const ref = decodeURIComponent((await params).ref);
  const sp = await searchParams;

  if (/^\d+$/.test(ref)) {
    const old = await getBooking(Number(ref), user).catch(notFoundIfMissing);
    redirect(`/bookings/${old.bookingNo}${queryString(sp)}`);
  }
  if (!BOOKING_NO.test(ref)) notFound();

  const b = await getBookingByNo(ref, user).catch(notFoundIfMissing);
  if (ref !== b.bookingNo) redirect(`/bookings/${b.bookingNo}${queryString(sp)}`); // bk-… → BK-…

  const [journey, [cust], [pat], hospitalList, packageList, confirmation, linkSum] = await Promise.all([
    getBookingJourney(String(b.id), user),
    db.select({ address: customers.address }).from(customers).where(eq(customers.id, b.customerId)),
    db.select({ careNotes: patients.careNotes }).from(patients).where(eq(patients.id, b.patientId)),
    db.select({ id: hospitals.id, name: hospitals.name, city: hospitals.city }).from(hospitals).where(eq(hospitals.isActive, true)).orderBy(asc(hospitals.name)),
    listPackages({ active: true }),
    loadBookingConfirmation(b.id),
    bookingLinkSummary(b.id),
  ]);

  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(user, p);
  const lastDay = b.endDate ?? b.serviceDate; // deliver on or after the last day
  const t = today();
  const back = typeof sp.back === "string" ? sp.back : undefined;
  const fromReports = sp.from === "reports" && back && SAFE_BACK.test(back) ? back : null;

  const actions = (
    <>
      {(b.status === "pending" || b.status === "confirmed" || b.status === "assigned") && can("createBooking") && (
        <EditBookingButton
          booking={{ ...b, locationType: b.locationType as "home" | "hospital" }}
          hospitals={hospitalList}
          packages={packageList.map((p) => ({ id: p.id, name: p.name, durationHours: p.durationHours, price: p.price }))}
          today={t}
        />
      )}
      {b.status === "pending" && can("useCallList") && <ConfirmButton bookingId={b.id} size="md" />}
      {b.status === "confirmed" && can("assignEmployee") && <AssignButton bookingId={b.id} bookingNo={b.bookingNo} serviceDate={b.serviceDate} size="md" />}
      {b.status === "assigned" && can("assignEmployee") && (
        <>
          <AssignButton bookingId={b.id} bookingNo={b.bookingNo} serviceDate={b.serviceDate} currentEmployeeId={b.employeeId} label="Reassign" variant="secondary" size="md" />
          <ActionButton action={unassignEmployeeAction} input={{ id: b.id }} size="md" confirm="Remove the employee and move the booking back to Confirmed?" success="Employee removed">
            Unassign
          </ActionButton>
        </>
      )}
      {b.status === "assigned" && can("markDelivered") && (
        <ActionButton
          action={deliverBookingAction}
          input={{ id: b.id, note: "Session completed" }}
          variant="primary"
          size="md"
          disabled={lastDay > t}
          confirm={`Mark ${b.bookingNo} as delivered? An invoice will be created.`}
          success="Delivered — invoice created"
        >
          {lastDay > t ? `Deliver on ${niceDate(lastDay)}` : "Mark delivered"}
        </ActionButton>
      )}
      {["pending", "confirmed", "assigned"].includes(b.status) && can("useCallList") && (
        <IgnoreButton bookingId={b.id} bookingNo={b.bookingNo} assigned={b.status === "assigned"} size="md" />
      )}
      {b.status !== "ignored" && can("createBooking") && (
        <WhatsappShare
          kind="booking"
          id={b.id}
          docNo={b.bookingNo}
          customerId={b.customerId}
          number={confirmation?.whatsappNumber ?? null}
          summary={{ ...linkSum, activeUntil: linkSum.activeUntil?.toISOString() ?? null, lastViewed: linkSum.lastViewed?.toISOString() ?? null }}
        />
      )}
      <LinkButton href={`/bookings/${b.bookingNo}/print`} variant="secondary" size="md">
        <Printer size={16} /> Print booking
      </LinkButton>
      {b.invoice && can("viewInvoices") && (
        <LinkButton href={`/invoices/${b.invoice.id}`} size="md">
          <FileText size={16} /> {b.status === "delivered" && can("printInvoice") ? "Print invoice" : "Invoice"} {b.invoice.invoiceNo}
        </LinkButton>
      )}
    </>
  );

  return (
    <div>
      <Link href={fromReports ?? "/bookings"} className="no-print mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={15} /> {fromReports ? "Back to Reports" : "Bookings"}
      </Link>

      <BookingJourney
        journey={journey}
        variant="page"
        actions={actions}
        canViewCustomer={can("manageCustomers")}
        canViewInvoice={can("viewInvoices")}
        extras={{ customerAltPhone: b.customerAltPhone, customerAddress: cust?.address, careNotes: pat?.careNotes, employeePhone: b.employeePhone }}
      />
    </div>
  );
}
