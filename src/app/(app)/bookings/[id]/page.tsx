import { asc, eq } from "drizzle-orm";
import { ArrowLeft, CalendarClock, FileText, Home, Hospital, Phone, StickyNote, UserRound } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AssignButton, ConfirmButton, IgnoreButton } from "@/components/app/booking-actions";
import { Avatar, Card, CardHeader, cn, LinkButton, money, niceDate, niceDateTime, niceTime, STATUS_DOT, StatusBadge } from "@/components/ui";
import { ActionButton } from "@/components/ui/client";
import { db } from "@/db";
import { customers, hospitals, patients } from "@/db/schema";
import { getBooking } from "@/features/bookings/service";
import { requirePermission } from "@/lib/dal";
import { today } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { hasPermission } from "@/lib/permissions";
import { deliverBookingAction, unassignEmployeeAction } from "../../_actions/bookings";
import { EditBookingButton } from "./edit-booking";

export const metadata = { title: "Booking · Care Booking" };

const STEPS = ["pending", "confirmed", "assigned", "delivered", "invoice_printed"] as const;
const STEP_LABEL = { pending: "Booked", confirmed: "Confirmed", assigned: "Assigned", delivered: "Delivered", invoice_printed: "Invoiced" };

export default async function BookingDetailPage({ params }: PageProps<"/bookings/[id]">) {
  const user = await requirePermission("viewReports");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const b = await getBooking(id, user).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [[cust], [pat], hospitalList] = await Promise.all([
    db.select().from(customers).where(eq(customers.id, b.customerId)),
    db.select().from(patients).where(eq(patients.id, b.patientId)),
    db.select({ id: hospitals.id, name: hospitals.name, city: hospitals.city }).from(hospitals).where(eq(hospitals.isActive, true)).orderBy(asc(hospitals.name)),
  ]);

  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(user, p);
  const t = today();
  const stepIndex = STEPS.indexOf(b.status as (typeof STEPS)[number]);

  return (
    <div>
      <Link href="/bookings" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={15} /> Bookings
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{b.bookingNo}</h1>
            <StatusBadge status={b.status} />
          </div>
          <p className="mt-1 text-sm text-muted">
            {niceDate(b.serviceDate)} · {niceTime(b.startTime)} · {b.durationHours}-hour session
          </p>
        </div>

        {/* Actions for the current step */}
        <div className="flex flex-wrap gap-2">
          {(b.status === "pending" || b.status === "confirmed") && can("createBooking") && (
            <EditBookingButton booking={{ ...b, locationType: b.locationType as "home" | "hospital" }} hospitals={hospitalList} today={t} />
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
              disabled={b.serviceDate > t}
              confirm={`Mark ${b.bookingNo} as delivered? An invoice will be created.`}
              success="Delivered — invoice created"
            >
              {b.serviceDate > t ? `Deliver on ${niceDate(b.serviceDate)}` : "Mark delivered"}
            </ActionButton>
          )}
          {["pending", "confirmed", "assigned"].includes(b.status) && can("useCallList") && (
            <IgnoreButton bookingId={b.id} bookingNo={b.bookingNo} assigned={b.status === "assigned"} size="md" />
          )}
          {b.invoice && can("viewInvoices") && (
            <LinkButton href={`/invoices/${b.invoice.id}`} size="md">
              <FileText size={16} /> Invoice {b.invoice.invoiceNo}
            </LinkButton>
          )}
        </div>
      </div>

      {/* Progress */}
      {b.status !== "ignored" ? (
        <Card className="mb-5 px-6 py-5">
          <div className="flex items-center">
            {STEPS.map((s, i) => (
              <div key={s} className={cn("flex items-center", i < STEPS.length - 1 && "flex-1")}>
                <div className="flex flex-col items-center gap-1.5">
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold",
                      i <= stepIndex ? "bg-gradient-to-br from-[#6658f5] to-[#8b5cf6] text-white shadow" : "bg-white/80 text-muted",
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className={cn("text-xs", i <= stepIndex ? "font-medium text-ink" : "text-muted")}>{STEP_LABEL[s]}</span>
                </div>
                {i < STEPS.length - 1 && <div className={cn("mx-2 mb-5 h-0.5 flex-1 rounded", i < stepIndex ? "bg-accent/60" : "bg-white/80")} />}
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card className="mb-5 border-rose-100 bg-rose-50/60 px-6 py-4 text-sm text-rose-800">This booking was ignored and will not be served.</Card>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <div className="grid gap-5 md:grid-cols-2">
            <Card>
              <CardHeader title="Customer" action={can("manageCustomers") && <Link href={`/customers/${b.customerId}`} className="text-xs font-medium text-accent hover:underline">Profile</Link>} />
              <div className="space-y-2 px-5 pb-5 text-sm">
                <div className="flex items-center gap-3">
                  <Avatar name={b.customerName} />
                  <div>
                    <div className="font-medium">{b.customerName}</div>
                    <div className="text-xs text-muted">{b.customerNo}</div>
                  </div>
                </div>
                <Info icon={<Phone size={14} />}>
                  <a href={`tel:${b.customerPhone}`} className="hover:text-accent">
                    {b.customerPhone}
                  </a>
                  {b.customerAltPhone && ` / ${b.customerAltPhone}`}
                </Info>
                {cust?.address && <Info icon={<Home size={14} />}>{cust.address}</Info>}
              </div>
            </Card>
            <Card>
              <CardHeader title="Patient" />
              <div className="space-y-2 px-5 pb-5 text-sm">
                <div className="flex items-center gap-3">
                  <Avatar name={b.patientName} />
                  <div>
                    <div className="font-medium">{b.patientName}</div>
                    <div className="text-xs text-muted">
                      {pat?.relationship === "self" ? "Customer themself" : cap(pat?.relationship)} · {cap(pat?.gender)}
                    </div>
                  </div>
                </div>
                {pat?.careNotes && <Info icon={<StickyNote size={14} />}>{pat.careNotes}</Info>}
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title="Session" />
            <div className="grid gap-4 px-5 pb-5 text-sm sm:grid-cols-2">
              <Info icon={<CalendarClock size={14} />} label="When">
                {niceDate(b.serviceDate)}, {niceTime(b.startTime)} · {b.durationHours} hours
              </Info>
              <Info icon={b.locationType === "hospital" ? <Hospital size={14} /> : <Home size={14} />} label="Where">
                {b.locationType === "hospital" ? `${b.hospitalName}${b.wardRoom ? `, ${b.wardRoom}` : ""}` : b.serviceAddress}
              </Info>
              <Info icon={<UserRound size={14} />} label="Employee">
                {b.employeeName ? `${b.employeeName}${b.employeePhone ? ` · ${b.employeePhone}` : ""}${b.branchName ? ` (${b.branchName})` : ""}` : "Not assigned yet"}
              </Info>
              <Info icon={<FileText size={14} />} label="Rate">
                {money(b.rate)}
              </Info>
              {b.notes && (
                <Info icon={<StickyNote size={14} />} label="Notes" className="sm:col-span-2">
                  {b.notes}
                </Info>
              )}
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader title="History" subtitle="Every status change" />
          <ol className="relative mx-5 mb-5 border-l-2 border-indigo-100">
            {b.history.map((h) => (
              <li key={h.id} className="mb-4 ml-4 last:mb-0">
                <span className={cn("absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full ring-4 ring-white/70", STATUS_DOT[h.toStatus])} />
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={h.toStatus} />
                  <span className="text-xs text-muted">{niceDateTime(h.createdAt)}</span>
                </div>
                <div className="mt-1 text-xs text-ink/80">by {h.userName}</div>
                {h.note && <div className="mt-1 rounded-lg bg-white/60 px-2.5 py-1.5 text-xs text-muted">{h.note}</div>}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}

function cap(s?: string | null) {
  return s ? s[0].toUpperCase() + s.slice(1) : "";
}

function Info({ icon, label, children, className }: { icon: ReactNode; label?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <span className="mt-0.5 text-accent">{icon}</span>
      <div>
        {label && <div className="text-xs text-muted">{label}</div>}
        <div className="text-ink/90">{children}</div>
      </div>
    </div>
  );
}
