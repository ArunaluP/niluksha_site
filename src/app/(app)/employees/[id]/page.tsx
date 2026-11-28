import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { ArrowLeft, CalendarOff, Check, FileSignature, Pencil, Phone, X } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EntityFormButton } from "@/components/app/entity-form";
import { Avatar, Card, CardHeader, cn, DaysTag, EmptyState, employeePhotoUrl, LinkButton, niceDate, niceDateTime, nicePeriod, niceTime, StatusBadge } from "@/components/ui";
import { ActionButton } from "@/components/ui/client";
import { db } from "@/db";
import { bookings, patients } from "@/db/schema";
import { DOCUMENTS, HEARD_FROM_LABELS } from "@/features/employees/registration";
import { getEmployeeDetail } from "@/features/employees/service";
import { requirePermission } from "@/lib/dal";
import { today } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { hasPermission } from "@/lib/permissions";
import { addLeaveAction, deleteLeaveAction } from "../../_actions/records";

export const metadata = { title: "Employee · Care Booking" };

export default async function EmployeePage({ params }: PageProps<"/employees/[id]">) {
  const user = await requirePermission("viewMasterData");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const e = await getEmployeeDetail(id, user).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const t = today();
  const upcoming = await db
      .select({ id: bookings.id, bookingNo: bookings.bookingNo, serviceDate: bookings.serviceDate, days: bookings.days, startTime: bookings.startTime, status: bookings.status, patientName: patients.fullName })
      .from(bookings)
      .innerJoin(patients, eq(patients.id, bookings.patientId))
      .where(and(eq(bookings.employeeId, id), gte(bookings.endDate, t), inArray(bookings.status, ["assigned", "delivered", "invoice_printed"])))
      .orderBy(asc(bookings.serviceDate))
      .limit(10);
  const canEdit = hasPermission(user, "manageEmployees");

  return (
    <div>
      <Link href="/employees" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={15} /> Employees
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={e.fullName} size="lg" src={employeePhotoUrl(e)} />
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{e.fullName}</h1>
              <StatusBadge status={e.status} />
            </div>
            <p className="text-sm text-muted">
              {e.fileNo && <span className="font-medium text-ink/80">No. {e.fileNo} · </span>}
              {e.empNo} · {e.designation} · {e.branchName}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href={`/employees/${e.id}/form`} variant="secondary">
            <FileSignature size={15} /> Print form (English)
          </LinkButton>
          <LinkButton href={`/employees/${e.id}/form?lang=si`} variant="secondary">
            <FileSignature size={15} /> Print form (සිංහල)
          </LinkButton>
          {canEdit && (
            <LinkButton href={`/employees/${e.id}/edit`} variant="secondary">
              <Pencil size={14} /> Edit
            </LinkButton>
          )}
        </div>
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <Card className="p-5 text-sm">
          <div className="mb-3 text-[15px] font-semibold">Details</div>
          <dl className="space-y-2.5">
            <Row label="Employee no.">{e.fileNo ?? "—"}</Row>
            <Row label="System no.">{e.empNo}</Row>
            <Row label="Phone">
              <a href={`tel:${e.phone}`} className="inline-flex items-center gap-1 hover:text-accent">
                <Phone size={12} /> {e.phone}
              </a>
              {e.altPhone && ` / ${e.altPhone}`}
            </Row>
            <Row label="Email">
              {e.email ? (
                <a href={`mailto:${e.email}`} className="hover:text-accent">
                  {e.email}
                </a>
              ) : (
                "—"
              )}
            </Row>
            <Row label="NIC">{e.nic ?? "—"}</Row>
            <Row label="Gender">{e.gender === "female" ? "Woman" : "Man"}</Row>
            <Row label="Date of birth">{niceDate(e.dob)}</Row>
            <Row label="Joined">{niceDate(e.joinDate)}</Row>
            {e.qualifications && <Row label="Qualifications">{e.qualifications}</Row>}
          </dl>
        </Card>

        <Card className="p-5 text-sm">
          <div className="mb-3 text-[15px] font-semibold">Address & guardian</div>
          <dl className="space-y-2.5">
            <Row label="Address">{e.address ?? "—"}</Row>
            <Row label="GN division">{e.gnDivision ?? "—"}</Row>
            <Row label="District">{e.district ?? "—"}</Row>
            <Row label="Police station">{e.nearestPolice ?? "—"}</Row>
            <Row label="Post office">{e.nearestPostOffice ?? "—"}</Row>
          </dl>
          <div className="my-4 border-t border-indigo-100/60" />
          <dl className="space-y-2.5">
            <Row label="Guardian">{e.guardianName ? `${e.guardianName}${e.guardianRelationship ? ` (${e.guardianRelationship})` : ""}` : "—"}</Row>
            <Row label="Guardian phone">
              {e.guardianPhone ? (
                <a href={`tel:${e.guardianPhone}`} className="hover:text-accent">
                  {e.guardianPhone}
                </a>
              ) : (
                "—"
              )}
            </Row>
            <Row label="Guardian address">{e.guardianAddress ?? "—"}</Row>
          </dl>
        </Card>

        <Card className="p-5 text-sm">
          <div className="mb-3 text-[15px] font-semibold">Registration</div>
          <dl className="space-y-2.5">
            <Row label="Heard from">
              {e.heardFrom ? HEARD_FROM_LABELS[e.heardFrom] : "—"}
              {e.heardFrom === "employee" && e.referredBy && (
                <>
                  {" · "}
                  <Link href={`/employees/${e.referredBy}`} className="text-accent hover:underline">
                    {e.referrerName}
                  </Link>
                </>
              )}
            </Row>
          </dl>
          <div className="mt-3 mb-1.5 text-xs font-medium text-muted">Documents received</div>
          <ul className="space-y-1">
            {DOCUMENTS.map((d) => (
              <li key={d.key} className={cn("flex items-center gap-2", e[d.key] ? "text-ink" : "text-muted")}>
                {e[d.key] ? <Check size={14} className="text-emerald-600" /> : <X size={14} className="text-slate-300" />}
                {d.label}
              </li>
            ))}
          </ul>
          <div className={cn("mt-4 rounded-xl p-3 text-xs", e.rulesAgreedAt ? "bg-emerald-50/80 text-emerald-900" : "bg-amber-50/80 text-amber-900")}>
            {e.rulesAgreedAt ? (
              <>
                <span className="font-semibold">Rules & declaration agreed</span> · {niceDateTime(e.rulesAgreedAt)}
                {e.rulesAgreedByName && ` · recorded by ${e.rulesAgreedByName}`}
              </>
            ) : (
              <>
                <span className="font-semibold">Rules not agreed yet.</span> Edit the employee and tick the agreement, then print the form for signatures.
              </>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Leave"
            subtitle="Days this employee can't be assigned"
            action={
              canEdit && (
                <EntityFormButton
                  mode="create"
                  title="Add leave"
                  subtitle={e.fullName}
                  fields={[
                    { name: "fromDate", label: "From", type: "date", required: true },
                    { name: "toDate", label: "To", type: "date", required: true },
                    { name: "reason", label: "Reason", full: true },
                  ]}
                  initial={{ fromDate: t, toDate: t }}
                  extra={{ employeeId: e.id }}
                  action={addLeaveAction}
                  success="Leave added"
                  buttonSize="sm"
                />
              )
            }
          />
          <div className="space-y-2 px-5 pb-5">
            {e.leaves.length === 0 && <EmptyState icon={<CalendarOff size={20} />} title="No leave recorded" />}
            {e.leaves.map((l) => (
              <div key={l.id} className="flex items-center gap-3 rounded-xl bg-white/60 p-3 text-sm">
                <div className="flex-1">
                  <div className="font-medium">
                    {niceDate(l.fromDate)}
                    {l.toDate !== l.fromDate && ` – ${niceDate(l.toDate)}`}
                  </div>
                  <div className="text-xs text-muted">
                    {l.reason ?? "No reason given"}
                    {l.toDate < t && " · past"}
                  </div>
                </div>
                {canEdit && (
                  <ActionButton action={deleteLeaveAction} input={{ id: l.id }} variant="ghost" confirm="Delete this leave record?" success="Leave removed">
                    Remove
                  </ActionButton>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Upcoming sessions" subtitle="Assigned from today" />
          <div className="space-y-2 px-5 pb-5">
            {upcoming.length === 0 && <p className="py-6 text-center text-sm text-muted">Nothing assigned.</p>}
            {upcoming.map((b) => (
              <Link key={b.id} href={`/bookings/${b.bookingNo}`} className="flex items-center gap-3 rounded-xl bg-white/60 p-3 text-sm hover:bg-white/90">
                <div className="flex-1">
                  <div className="font-medium">{b.patientName}</div>
                  <div className="text-xs text-muted">
                    {nicePeriod(b.serviceDate, b.days)} · {niceTime(b.startTime)} · {b.bookingNo}
                    <DaysTag days={b.days} />
                  </div>
                </div>
                <StatusBadge status={b.status} />
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2">
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
