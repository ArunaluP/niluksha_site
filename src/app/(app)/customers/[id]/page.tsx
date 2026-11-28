import { ArrowLeft, Cake, CalendarPlus, Home, IdCard, Mail, MessageCircle, Phone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EntityFormButton, type FieldDef } from "@/components/app/entity-form";
import { Avatar, Card, CardHeader, DaysTag, EmptyState, LinkButton, money, niceDate, nicePeriod, StatusBadge, Table, Td, Th } from "@/components/ui";
import { getCustomer } from "@/features/customers/service";
import { requirePermission } from "@/lib/dal";
import { NotFoundError } from "@/lib/errors";
import { addPatientAction } from "../../_actions/bookings";
import { NAME_FIELD_DEFS, nameInitial } from "@/components/app/name-field-defs";
import { RELATIONSHIP_OTHER_MAX, relationshipLabel, selfPatientValues, whatsappNumberOf } from "@/lib/lk-rules";
import { updateCustomerAction, updatePatientAction } from "../../_actions/records";

export const metadata = { title: "Customer · Care Booking" };

const CUSTOMER_FIELDS: FieldDef[] = [
  ...NAME_FIELD_DEFS,
  { name: "phone", label: "Phone", required: true, whatsapp: "phoneWhatsapp", full: true },
  { name: "altPhone", label: "Other phone", whatsapp: "altPhoneWhatsapp", full: true },
  { name: "whatsappPhone", label: "WhatsApp number", whatsappFallback: true },
  { name: "email", label: "Email", type: "email", placeholder: "Optional, e.g. name@gmail.com", maxLength: 160, full: true },
  { name: "nic", label: "NIC", nic: true, placeholder: "199012345678 or 901234567V" },
  { name: "dob", label: "Date of birth", type: "date", hint: "Filled from the NIC" },
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
  ...NAME_FIELD_DEFS,
  { name: "relationship", label: "Relationship", type: "select", required: true, options: RELATIONSHIPS },
  { name: "relationshipOther", label: "Specify relationship", required: true, placeholder: "e.g. Grandmother, Neighbour", maxLength: RELATIONSHIP_OTHER_MAX, showWhen: { field: "relationship", value: "other" } },
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
  const waNumber = whatsappNumberOf(c);
  // Patient relationship "Customer themself" → copy this customer's details
  const selfFill = { field: "relationship", value: "self", values: selfPatientValues(c) };

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
            initial={{ ...nameInitial(c), phone: c.phone, altPhone: c.altPhone ?? "", phoneWhatsapp: c.phoneWhatsapp, altPhoneWhatsapp: c.altPhoneWhatsapp, whatsappPhone: c.whatsappPhone ?? "", email: c.email ?? "", nic: c.nic ?? "", dob: c.dob ?? "", city: c.city ?? "", address: c.address ?? "", notes: c.notes ?? "" }}
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
              <div className="flex items-center gap-2.5">
                <MessageCircle size={14} className="text-[#1fa855]" />
                {waNumber ? (
                  <span>
                    {waNumber} <span className="text-muted">· WhatsApp (invoices)</span>
                  </span>
                ) : (
                  <span className="text-muted">No WhatsApp number</span>
                )}
              </div>
              {c.email && (
                <div className="flex items-center gap-2.5">
                  <Mail size={14} className="text-accent" />
                  <a href={`mailto:${c.email}`} className="hover:text-accent">
                    {c.email}
                  </a>
                </div>
              )}
              {c.nic && (
                <div className="flex items-center gap-2.5">
                  <IdCard size={14} className="text-accent" /> {c.nic}
                </div>
              )}
              {c.dob && (
                <div className="flex items-center gap-2.5">
                  <Cake size={14} className="text-accent" /> Born {niceDate(c.dob)}
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
                <EntityFormButton mode="create" title="Add patient" fields={PATIENT_FIELDS} initial={{ relationship: "parent" }} autoFill={selfFill} extra={{ customerId: c.id }} action={addPatientAction} success="Patient added" buttonSize="sm" />
              }
            />
            <div className="space-y-2 px-5 pb-5">
              {c.patients.map((p) => (
                <div key={p.id} className="flex items-start gap-3 rounded-xl bg-white/60 p-3">
                  <Avatar name={p.fullName} size="sm" />
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="font-medium">{p.fullName}</div>
                    <div className="text-xs text-muted">
                      {relationshipLabel(p.relationship, p.relationshipOther)} · {p.gender === "female" ? "Woman" : "Man"} · {p.patientNo}
                    </div>
                    {p.careNotes && <div className="mt-1 text-xs text-ink/70">{p.careNotes}</div>}
                  </div>
                  <EntityFormButton
                    mode="edit"
                    title={`Edit ${p.fullName}`}
                    fields={PATIENT_FIELDS}
                    autoFill={selfFill}
                    initial={{ ...nameInitial(p), gender: p.gender, relationship: p.relationship, relationshipOther: p.relationshipOther ?? "", dob: p.dob ?? "", address: p.address ?? "", careNotes: p.careNotes ?? "" }}
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
                      <Link href={`/bookings/${b.bookingNo}`} className="font-medium text-accent hover:underline">
                        {b.bookingNo}
                      </Link>
                      <div className="text-xs text-muted">
                        {nicePeriod(b.serviceDate, b.days)}
                        <DaysTag days={b.days} />
                      </div>
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
