import { ArrowLeft, CalendarPlus, Home, IdCard, Phone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EntityFormButton, type FieldDef } from "@/components/app/entity-form";
import { Avatar, Card, CardHeader, EmptyState, LinkButton, money, niceDate, StatusBadge, Table, Td, Th } from "@/components/ui";
import { getCustomer } from "@/features/customers/service";
import { requirePermission } from "@/lib/dal";
import { NotFoundError } from "@/lib/errors";
import { addPatientAction } from "../../_actions/bookings";
import { updateCustomerAction, updatePatientAction } from "../../_actions/records";

export const metadata = { title: "Customer · Care Booking" };

const CUSTOMER_FIELDS: FieldDef[] = [
  { name: "fullName", label: "Full name", required: true, full: true },
  { name: "phone", label: "Phone", required: true },
  { name: "altPhone", label: "Other phone" },
  { name: "nic", label: "NIC" },
  { name: "city", label: "City" },
  { name: "address", label: "Address", full: true },
  { name: "notes", label: "Notes", type: "textarea", full: true },
];

const RELATIONSHIPS = [
  { value: "self", label: "Customer themself" },
  { value: "parent", label: "Parent" },
  { value: "spouse", label: "Spouse" },
  { value: "child", label: "Child" },
  { value: "sibling", label: "Sibling" },
  { value: "other", label: "Other" },
];

const PATIENT_FIELDS: FieldDef[] = [
  { name: "gender", label: "Gender", type: "radio", required: true, options: [{ value: "female", label: "Woman" }, { value: "male", label: "Man" }], full: true },
  { name: "fullName", label: "Full name", required: true },
  { name: "relationship", label: "Relationship", type: "select", required: true, options: RELATIONSHIPS },
  { name: "dob", label: "Date of birth", type: "date" },
  { name: "address", label: "Address", hint: "Empty = customer's address" },
  { name: "careNotes", label: "Care notes", type: "textarea", full: true },
];

export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  await requirePermission("manageCustomers");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const c = await getCustomer(id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });

  return (
    <div>
      <Link href="/customers" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={15} /> Customers
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={c.fullName} />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{c.fullName}</h1>
            <p className="text-sm text-muted">
              {c.customerNo} · customer since {niceDate(c.createdAt.toISOString())}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <EntityFormButton
            mode="edit"
            title="Edit customer"
            fields={CUSTOMER_FIELDS}
            initial={{ fullName: c.fullName, phone: c.phone, altPhone: c.altPhone ?? "", nic: c.nic ?? "", city: c.city ?? "", address: c.address ?? "", notes: c.notes ?? "" }}
            extra={{ id: c.id }}
            action={updateCustomerAction}
            success="Customer updated"
          />
          <LinkButton href={`/bookings/new?customerId=${c.id}`}>
            <CalendarPlus size={16} /> New booking
          </LinkButton>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <Card className="p-5 text-sm">
            <div className="mb-3 text-[15px] font-semibold">Contact</div>
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <Phone size={14} className="text-accent" />
                <a href={`tel:${c.phone}`}>{c.phone}</a>
                {c.altPhone && <span className="text-muted">/ {c.altPhone}</span>}
              </div>
              {c.nic && (
                <div className="flex items-center gap-2.5">
                  <IdCard size={14} className="text-accent" /> {c.nic}
                </div>
              )}
              {c.address && (
                <div className="flex items-start gap-2.5">
                  <Home size={14} className="mt-0.5 text-accent" />
                  {c.address}
                  {c.city ? `, ${c.city}` : ""}
                </div>
              )}
              {c.notes && <div className="rounded-xl bg-white/60 p-3 text-xs text-muted">{c.notes}</div>}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Patients"
              subtitle={`${c.patients.length} registered`}
              action={
                <EntityFormButton mode="create" title="Add patient" fields={PATIENT_FIELDS} initial={{ relationship: "parent" }} extra={{ customerId: c.id }} action={addPatientAction} success="Patient added" buttonSize="sm" />
              }
            />
            <div className="space-y-2 px-5 pb-5">
              {c.patients.map((p) => (
                <div key={p.id} className="flex items-start gap-3 rounded-xl bg-white/60 p-3">
                  <Avatar name={p.fullName} size="sm" />
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="font-medium">{p.fullName}</div>
                    <div className="text-xs text-muted">
                      {RELATIONSHIPS.find((r) => r.value === p.relationship)?.label} · {p.gender === "female" ? "Woman" : "Man"} · {p.patientNo}
                    </div>
                    {p.careNotes && <div className="mt-1 text-xs text-ink/70">{p.careNotes}</div>}
                  </div>
                  <EntityFormButton
                    mode="edit"
                    title={`Edit ${p.fullName}`}
                    fields={PATIENT_FIELDS}
                    initial={{ fullName: p.fullName, gender: p.gender, relationship: p.relationship, dob: p.dob ?? "", address: p.address ?? "", careNotes: p.careNotes ?? "" }}
                    extra={{ id: p.id }}
                    action={updatePatientAction}
                    success="Patient updated"
                    buttonSize="sm"
                    buttonVariant="ghost"
                    buttonLabel=""
                  />
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card strong className="lg:col-span-2">
          <CardHeader title="Recent bookings" subtitle="Last 20 sessions" />
          {c.recentBookings.length === 0 ? (
            <EmptyState title="No bookings yet" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Booking</Th>
                  <Th>Patient</Th>
                  <Th>Employee</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Rate</Th>
                </tr>
              </thead>
              <tbody>
                {c.recentBookings.map((b) => (
                  <tr key={b.id} className="hover:bg-white/50">
                    <Td className="whitespace-nowrap">
                      <Link href={`/bookings/${b.id}`} className="font-medium text-accent hover:underline">
                        {b.bookingNo}
                      </Link>
                      <div className="text-xs text-muted">{niceDate(b.serviceDate)}</div>
                    </Td>
                    <Td>{b.patientName}</Td>
                    <Td className="text-muted">{b.employeeName ?? "—"}</Td>
                    <Td>
                      <StatusBadge status={b.status} />
                    </Td>
                    <Td className="text-right">{money(b.rate)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
