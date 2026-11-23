import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { nameInitial } from "@/components/app/name-field-defs";
import { ArrowLeft, CalendarOff, Phone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EntityFormButton } from "@/components/app/entity-form";
import { Avatar, Card, CardHeader, EmptyState, niceDate, niceTime, StatusBadge } from "@/components/ui";
import { ActionButton } from "@/components/ui/client";
import { db } from "@/db";
import { bookings, branches, patients } from "@/db/schema";
import { getEmployeeDetail } from "@/features/employees/service";
import { requirePermission } from "@/lib/dal";
import { today } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { hasPermission } from "@/lib/permissions";
import { addLeaveAction, deleteLeaveAction, updateEmployeeAction } from "../../_actions/records";
import { employeeFields } from "../fields";

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
  const [branchList, upcoming] = await Promise.all([
    db.select({ id: branches.id, name: branches.name }).from(branches).orderBy(asc(branches.name)),
    db
      .select({ id: bookings.id, bookingNo: bookings.bookingNo, serviceDate: bookings.serviceDate, startTime: bookings.startTime, status: bookings.status, patientName: patients.fullName })
      .from(bookings)
      .innerJoin(patients, eq(patients.id, bookings.patientId))
      .where(and(eq(bookings.employeeId, id), gte(bookings.serviceDate, t), inArray(bookings.status, ["assigned", "delivered", "invoice_printed"])))
      .orderBy(asc(bookings.serviceDate))
      .limit(10),
  ]);
  const canEdit = hasPermission(user, "manageEmployees");

  return (
    <div>
      <Link href="/employees" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={15} /> Employees
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={e.fullName} />
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{e.fullName}</h1>
              <StatusBadge status={e.status} />
            </div>
            <p className="text-sm text-muted">
              {e.empNo} · {e.designation} · {e.branchName}
            </p>
          </div>
        </div>
        {canEdit && (
          <EntityFormButton
            mode="edit"
            title="Edit employee"
            fields={employeeFields(branchList)}
            initial={{
              ...nameInitial(e),
              designation: e.designation,
              branchId: String(e.branchId),
              gender: e.gender,
              nic: e.nic ?? "",
              phone: e.phone,
              altPhone: e.altPhone ?? "",
              email: e.email ?? "",
              dob: e.dob ?? "",
              joinDate: e.joinDate ?? "",
              address: e.address ?? "",
              qualifications: e.qualifications ?? "",
              status: e.status,
            }}
            extra={{ id: e.id }}
            action={updateEmployeeAction}
            success="Employee updated"
            wide
          />
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5 text-sm">
          <div className="mb-3 text-[15px] font-semibold">Details</div>
          <dl className="space-y-2.5">
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
            <Row label="Address">{e.address ?? "—"}</Row>
            {e.qualifications && <Row label="Qualifications">{e.qualifications}</Row>}
          </dl>
        </Card>

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
              <Link key={b.id} href={`/bookings/${b.id}`} className="flex items-center gap-3 rounded-xl bg-white/60 p-3 text-sm hover:bg-white/90">
                <div className="flex-1">
                  <div className="font-medium">{b.patientName}</div>
                  <div className="text-xs text-muted">
                    {niceDate(b.serviceDate)} · {niceTime(b.startTime)} · {b.bookingNo}
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
