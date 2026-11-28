"use client";

import { ArrowLeft, ArrowRight, Check, HeartPulse, Home, Hospital, Phone, Plus, Printer, Search, UserPlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  addPatientAction,
  createBookingAction,
  createCustomerAction,
  getCustomerAction,
  searchCustomersAction,
} from "@/app/(app)/_actions/bookings";
import { Avatar, Button, cn, dayCount, Field, Input, LinkButton, money, niceDate, nicePeriod, niceTime, Select, Textarea } from "@/components/ui";
import { DaysStepper } from "@/components/app/days-stepper";
import { endDateOf } from "@/lib/dates";
import { NameFields } from "@/components/app/name-fields";
import { PhoneWithWhatsapp, WhatsappNumberField } from "@/components/app/whatsapp-phone";
import { WhatsappShare } from "@/components/app/whatsapp-share";
import {
  checkCustomer,
  checkNameParts,
  checkRelationshipOther,
  checkWardBed,
  BED_MAX,
  WARD_MAX,
  EMAIL_MAX,
  parseNic,
  RELATIONSHIP_OTHER_MAX,
  relationshipLabel,
  selfPatientValues,
  tickedPhoneHasNumber,
  type CustomerFields,
} from "@/lib/lk-rules";

type Patient = { id: number; patientNo: string; fullName: string; gender: "male" | "female"; relationship: string; relationshipOther: string | null; address: string | null; careNotes: string | null };
type Customer = { id: number; customerNo: string; fullName: string; firstName: string; middleName: string | null; lastName: string; dob: string | null; phone: string; altPhone: string | null; nic: string | null; address: string | null; city: string | null; patients: Patient[] };
type SearchHit = { id: number; customerNo: string; fullName: string; phone: string; nic: string | null; city: string | null; patientCount: number };
type PackageOpt = { id: number; name: string; durationHours: number; price: string; description: string | null; isDefault: boolean };
type HospitalOpt = { id: number; name: string; type: "private" | "government"; city: string | null };
type Errors = Record<string, string[] | undefined>;

const STEPS = ["Customer", "Patient", "Session"] as const;
const RELATIONSHIPS = [
  ["self", "Customer themself"],
  ["parent", "Parent"],
  ["spouse", "Spouse"],
  ["child", "Child"],
  ["sibling", "Sibling"],
  ["other", "Other"],
] as const;

export function BookingWizard({
  hospitals,
  packages,
  today,
  initialCustomer,
}: {
  hospitals: HospitalOpt[];
  packages: PackageOpt[];
  today: string;
  initialCustomer: Customer | null;
}) {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(initialCustomer ? 1 : 0);
  const [customer, setCustomer] = useState<Customer | null>(initialCustomer);
  const [patientId, setPatientId] = useState<number | "new" | null>(initialCustomer?.patients[0]?.id ?? null);
  const [done, setDone] = useState<{ id: number; bookingNo: string; customerId: number; whatsappNumber: string | null } | null>(null);
  const [pending, start] = useTransition();

  // ---------------- step 1: customer
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [newCust, setNewCust] = useState(false);
  const [cust, setCust] = useState({ firstName: "", middleName: "", lastName: "", phone: "", altPhone: "", whatsappPhone: "", email: "", nic: "", dob: "", address: "", city: "" });
  // WhatsApp ticks in front of the phone boxes: on by default.
  const [wa, setWa] = useState({ phoneWhatsapp: true, altPhoneWhatsapp: true });
  const custAll = { ...cust, ...wa };
  const needsWaBox = !tickedPhoneHasNumber(custAll);
  const [custErr, setCustErr] = useState<Errors>({});

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(async () => {
      const r = await searchCustomersAction({ q: q.trim() });
      if (r.ok) setHits(r.data);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  function pickCustomer(id: number) {
    start(async () => {
      const r = await getCustomerAction({ id });
      if (!r.ok) { toast.error(r.error); return; }
      const c = r.data as unknown as Customer;
      setCustomer(c);
      setPatientId(c.patients[0]?.id ?? "new");
      setStep(1);
    });
  }

  function editCust(patch: Partial<typeof cust>) {
    setCust((v) => ({ ...v, ...patch }));
    setCustErr((e) => dropErrors(e, patch, cust));
  }

  /** Re-checks one field when the user leaves it (only once it has an error or a value). */
  function checkCustField(name: keyof CustomerFields) {
    const e = checkCustomer(custAll)[name];
    if (e) setCustErr((prev) => ({ ...prev, [name]: [e] }));
  }

  /** Leaving the NIC box: a valid NIC fills (and replaces) the date of birth. */
  function fillFromNic() {
    const n = cust.nic.trim() ? parseNic(cust.nic) : null;
    if (n && !("error" in n)) {
      setCust((v) => ({ ...v, dob: n.dob }));
      setCustErr((e) => ({ ...e, nic: undefined, dob: undefined }));
    } else checkCustField("nic");
  }

  // "Male · born 6 Dec 1985" under a valid NIC
  const nicInfo = cust.nic.trim() ? parseNic(cust.nic) : null;
  const nicHint = nicInfo && !("error" in nicInfo) ? `${nicInfo.gender === "male" ? "Male" : "Female"} · born ${niceDate(nicInfo.dob)}` : undefined;

  function saveCustomer() {
    const e = checkCustomer(custAll);
    if (Object.keys(e).length) {
      setCustErr(Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [v]])));
      toast.error("Please fix the highlighted fields.");
      return;
    }
    start(async () => {
      const { whatsappPhone, ...rest } = clean(cust);
      const r = await createCustomerAction({ ...rest, ...wa, ...(needsWaBox && whatsappPhone ? { whatsappPhone } : {}) });
      if (!r.ok) {
        setCustErr(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      const c = r.data as unknown as Customer;
      toast.success(`Customer ${c.customerNo} registered`);
      setCustomer(c);
      setPatientId("new");
      setStep(1);
    });
  }

  // ---------------- step 2: patient
  const [pat, setPat] = useState({ firstName: "", middleName: "", lastName: "", gender: "" as "" | "male" | "female", relationship: "parent", relationshipOther: "", dob: "", address: "", careNotes: "" });
  const [patErr, setPatErr] = useState<Errors>({});

  /** Update fields and drop their error messages as soon as the user edits them. */
  function editPat(patch: Partial<typeof pat>) {
    setPat((v) => ({ ...v, ...patch }));
    setPatErr((e) => dropErrors(e, patch, pat));
  }
  const patient = customer?.patients.find((p) => p.id === patientId) ?? null;

  function continueFromPatient() {
    if (patientId !== "new") return setStep(2);
    const nameErr: Record<string, string> = { ...checkNameParts(pat) };
    if (pat.relationship === "other") {
      const r = checkRelationshipOther(pat.relationshipOther);
      if (r) nameErr.relationshipOther = r;
    }
    if (Object.keys(nameErr).length) {
      setPatErr(Object.fromEntries(Object.entries(nameErr).map(([k, v]) => [k, [v]])));
      toast.error("Please fix the highlighted fields.");
      return;
    }
    start(async () => {
      const r = await addPatientAction({ customerId: customer!.id, ...clean({ ...pat, relationshipOther: pat.relationship === "other" ? pat.relationshipOther : "" }), gender: pat.gender || undefined } as Parameters<typeof addPatientAction>[0]);
      if (!r.ok) {
        setPatErr(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      const p = r.data as unknown as Patient;
      toast.success(`Patient ${p.fullName} added`);
      setCustomer({ ...customer!, patients: [...customer!.patients, p] });
      setPatientId(p.id);
      setStep(2);
    });
  }

  // ---------------- step 3: session
  const defaultPackageId = String((packages.find((p) => p.isDefault) ?? packages[0])?.id ?? "");
  const [ses, setSes] = useState({ packageId: defaultPackageId, serviceDate: today, days: 1, startTime: "08:00", locationType: "home" as "home" | "hospital", hospitalId: "", wardNo: "", bedNo: "", serviceAddress: "", notes: "" });
  const selectedPackage = packages.find((p) => String(p.id) === ses.packageId) ?? null;
  // "08:00" + 12 h → "20:00"; past midnight → next day
  const [sh, sm] = ses.startTime.split(":").map(Number);
  const endMinutes = (sh || 0) * 60 + (sm || 0) + (selectedPackage?.durationHours ?? 0) * 60;
  const endsNextDay = endMinutes >= 24 * 60;
  const endTime = `${String(Math.floor(endMinutes / 60) % 24).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
  const [sesErr, setSesErr] = useState<Errors>({});
  const defaultAddress = patient?.address || customer?.address || "";

  function submitBooking() {
    if (ses.locationType === "hospital") {
      const ward = checkWardBed(ses.wardNo, "Ward no");
      const bed = ses.bedNo.trim() ? checkWardBed(ses.bedNo, "Bed no") : null;
      if (ward || bed) {
        setSesErr((er) => ({ ...er, ...(ward ? { wardNo: [ward] } : {}), ...(bed ? { bedNo: [bed] } : {}) }));
        toast.error("Please fix the highlighted fields.");
        return;
      }
    }
    start(async () => {
      const r = await createBookingAction({
        customerId: customer!.id,
        patientId: patient!.id,
        packageId: ses.packageId ? Number(ses.packageId) : undefined,
        serviceDate: ses.serviceDate,
        days: ses.days,
        startTime: ses.startTime,
        locationType: ses.locationType,
        hospitalId: ses.locationType === "hospital" && ses.hospitalId ? Number(ses.hospitalId) : undefined,
        wardNo: ses.locationType === "hospital" ? ses.wardNo || undefined : undefined,
        bedNo: ses.locationType === "hospital" ? ses.bedNo || undefined : undefined,
        serviceAddress: ses.locationType === "home" ? ses.serviceAddress || defaultAddress || undefined : undefined,
        notes: ses.notes || undefined,
      });
      if (!r.ok) {
        setSesErr(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      toast.success(`Booking ${r.data.bookingNo} recorded`);
      setDone(r.data);
      setStep(3);
    });
  }

  function reset(keepCustomer: boolean) {
    setDone(null);
    setSes({ packageId: defaultPackageId, serviceDate: today, days: 1, startTime: "08:00", locationType: "home", hospitalId: "", wardNo: "", bedNo: "", serviceAddress: "", notes: "" });
    setSesErr({});
    if (keepCustomer) return setStep(1);
    setCustomer(null);
    setQ("");
    setHits(null);
    setNewCust(false);
    setStep(0);
  }

  return (
    <div className="glass-strong grid min-h-[640px] overflow-hidden p-0 lg:grid-cols-[minmax(260px,34%)_1fr]">
      {/* Left illustration panel */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#b9b1ff] via-[#a99cf9] to-[#8f84f3] p-8 text-white lg:block">
        <div className="absolute -left-10 bottom-16 h-40 w-40 rounded-full bg-sky-300/50 blur-2xl" />
        <div className="absolute right-[-40px] top-24 h-44 w-44 rounded-full bg-[radial-gradient(circle_at_30%_30%,#c4b5fd,#7c6cf8)] opacity-80 shadow-[0_0_60px_rgba(167,139,250,0.7)]" />
        <div className="absolute bottom-10 left-8 h-14 w-14 rounded-full bg-[radial-gradient(circle_at_35%_35%,#ffffff,#a5b4fc)] opacity-80" />
        <div className="absolute right-10 bottom-28 h-10 w-10 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fed7aa,#fb923c)]" />

        <div className="relative">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-white/80">New booking</div>
          <h2 className="mt-2 text-2xl font-semibold leading-snug">Book a care session in three quick steps</h2>
        </div>

        <div className="relative mx-auto my-10 flex h-40 w-40 items-center justify-center rounded-full border border-white/40 bg-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] backdrop-blur-md">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/90 text-accent shadow-xl">
            <HeartPulse size={44} />
          </div>
        </div>

        <ol className="relative space-y-3">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold",
                  step > i ? "border-white bg-white text-accent" : step === i ? "border-white bg-white/25" : "border-white/50 text-white/70",
                )}
              >
                {step > i ? <Check size={15} /> : i + 1}
              </span>
              <span className={cn("text-sm", step === i ? "font-semibold" : "text-white/80")}>{s}</span>
            </li>
          ))}
        </ol>
        <p className="relative mt-8 text-xs leading-relaxed text-white/85">
          Pick a care package (hours and price) in the last step. The booking goes to the call list for confirmation.
        </p>
      </aside>

      {/* Form side */}
      <section className="bg-gradient-to-br from-white/50 to-[#e8ebff]/60 px-6 py-8 sm:px-10">
        {step < 3 && <div className="text-xs font-medium text-muted">step {step + 1}/3</div>}

        {/* ---------------- STEP 1: CUSTOMER */}
        {step === 0 && (
          <div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Who is calling?</h1>
            <p className="mt-1 text-sm text-muted">Search by phone number, NIC or name. Returning customers only need the session details.</p>

            {!newCust ? (
              <>
                <div className="relative mt-6 max-w-xl">
                  <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
                  <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. 0771234567" className="h-12 pl-11 text-base" />
                </div>
                <div className="mt-4 max-w-xl space-y-2">
                  {q.trim().length >= 2 && hits?.length === 0 && <p className="text-sm text-muted">No customer found for “{q}”.</p>}
                  {q.trim().length >= 2 &&
                    hits?.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        disabled={pending}
                        onClick={() => pickCustomer(h.id)}
                        className="flex w-full items-center gap-3 rounded-xl border border-white bg-white/70 p-3 text-left transition hover:bg-white hover:shadow-sm"
                      >
                        <Avatar name={h.fullName} />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{h.fullName}</div>
                          <div className="text-xs text-muted">
                            {h.phone} · {h.customerNo}
                            {h.city ? ` · ${h.city}` : ""} · {h.patientCount} patient{h.patientCount === 1 ? "" : "s"}
                          </div>
                        </div>
                        <ArrowRight size={16} className="text-muted" />
                      </button>
                    ))}
                </div>
                <Button
                  variant="secondary"
                  className="mt-6"
                  onClick={() => {
                    setNewCust(true);
                    if (/^[0-9+\s-]{6,}$/.test(q.trim())) setCust((c) => ({ ...c, phone: q.trim() }));
                  }}
                >
                  <UserPlus size={16} /> Register a new customer
                </Button>
              </>
            ) : (
              <div className="mt-6 max-w-2xl">
                <div className="grid gap-4 sm:grid-cols-2">
                  <NameFields
                    className="sm:col-span-2"
                    autoFocus
                    value={cust}
                    onChange={(n) => editCust(n)}
                    errors={custErr}
                    onBlur={(k) => checkCustField(k)}
                  />
                  <PhoneWithWhatsapp
                    label="Phone number"
                    required
                    value={cust.phone}
                    onChange={(v) => editCust({ phone: v })}
                    onBlur={() => checkCustField("phone")}
                    whatsapp={wa.phoneWhatsapp}
                    onWhatsapp={(on) => setWa((w) => ({ ...w, phoneWhatsapp: on }))}
                    error={custErr.phone}
                    placeholder="0771234567"
                  />
                  <PhoneWithWhatsapp
                    label="Other phone"
                    value={cust.altPhone}
                    onChange={(v) => editCust({ altPhone: v })}
                    onBlur={() => checkCustField("altPhone")}
                    whatsapp={wa.altPhoneWhatsapp}
                    onWhatsapp={(on) => setWa((w) => ({ ...w, altPhoneWhatsapp: on }))}
                    error={custErr.altPhone}
                    placeholder="Optional"
                  />
                  {needsWaBox && (
                    <WhatsappNumberField
                      className="sm:col-span-2"
                      value={cust.whatsappPhone}
                      onChange={(v) => editCust({ whatsappPhone: v })}
                      onBlur={() => checkCustField("whatsappPhone")}
                      error={custErr.whatsappPhone}
                    />
                  )}
                  <Field label="Email" error={custErr.email} className="sm:col-span-2">
                    <Input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={cust.email}
                      onChange={(e) => editCust({ email: e.target.value.replace(/\s/g, "") })}
                      onBlur={() => checkCustField("email")}
                      maxLength={EMAIL_MAX}
                      placeholder="Optional, e.g. name@gmail.com"
                    />
                  </Field>
                  <Field label="NIC" error={custErr.nic} hint={nicHint}>
                    <Input value={cust.nic} onChange={(e) => editCust({ nic: e.target.value.toUpperCase().replace(/[^0-9VX]/g, "") })} onBlur={fillFromNic} maxLength={12} placeholder="199012345678 or 901234567V" />
                  </Field>
                  <Field label="Date of birth" error={custErr.dob} hint={nicHint ? "Filled from the NIC" : undefined}>
                    <Input type="date" max={today} min="1900-01-01" value={cust.dob} onChange={(e) => editCust({ dob: e.target.value })} onBlur={() => checkCustField("dob")} />
                  </Field>
                  <Field label="City" error={custErr.city}>
                    <Input value={cust.city} onChange={(e) => editCust({ city: e.target.value })} onBlur={() => checkCustField("city")} maxLength={80} placeholder="Kadawatha" />
                  </Field>
                  <Field label="Address" error={custErr.address} hint="Used as the care address for home sessions unless the patient has their own.">
                    <Input value={cust.address} onChange={(e) => editCust({ address: e.target.value })} onBlur={() => checkCustField("address")} maxLength={255} placeholder="House no, street, town" />
                  </Field>
                </div>
                <div className="mt-8 flex gap-2">
                  <Button variant="secondary" onClick={() => setNewCust(false)}>
                    <ArrowLeft size={16} /> Back to search
                  </Button>
                  <Button onClick={saveCustomer} disabled={pending}>
                    {pending ? "Saving…" : "Save & continue"} <ArrowRight size={16} />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---------------- STEP 2: PATIENT */}
        {step === 1 && customer && (
          <div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Who needs care?</h1>
            <CustomerChip customer={customer} onChange={() => reset(false)} />

            <div className="mt-6 grid max-w-2xl gap-3 sm:grid-cols-2">
              {customer.patients.map((p) => (
                <ChoiceCard key={p.id} active={patientId === p.id} onClick={() => setPatientId(p.id)}>
                  <div className="font-medium">{p.fullName}</div>
                  <div className="text-xs capitalize text-muted">
                    {relationshipLabel(p.relationship, p.relationshipOther)} · {p.gender} · {p.patientNo}
                  </div>
                </ChoiceCard>
              ))}
              <ChoiceCard active={patientId === "new"} onClick={() => setPatientId("new")}>
                <div className="flex items-center gap-2 font-medium text-accent">
                  <Plus size={16} /> Add a new patient
                </div>
                <div className="text-xs text-muted">Someone else this customer books for</div>
              </ChoiceCard>
            </div>

            {patientId === "new" && (
              <div className="mt-6 max-w-2xl">
                <div className="mb-4">
                  <div className="mb-2 text-sm font-semibold">Patient&apos;s gender</div>
                  <div className="flex gap-6">
                    {(["female", "male"] as const).map((g) => (
                      <label key={g} className="flex cursor-pointer items-center gap-2 text-sm">
                        <span
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded-md border-2 transition",
                            pat.gender === g ? "border-accent bg-accent-soft text-accent" : "border-[#c7cbee] bg-white/70",
                          )}
                        >
                          {pat.gender === g && <span className="h-2.5 w-2.5 rounded-sm bg-accent" />}
                        </span>
                        <input type="radio" name="gender" className="sr-only" checked={pat.gender === g} onChange={() => editPat({ gender: g })} />
                        {g === "female" ? "Woman" : "Man"}
                      </label>
                    ))}
                  </div>
                  {patErr.gender && <p className="mt-1 text-xs text-rose-600">{patErr.gender[0]}</p>}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <NameFields
                    className="sm:col-span-2"
                    value={pat}
                    onChange={(n) => editPat(n)}
                    errors={patErr}
                    onBlur={(k) => {
                      const e = checkNameParts(pat)[k];
                      if (e) setPatErr((prev) => ({ ...prev, [k]: [e] }));
                    }}
                  />
                  <Field label="Relationship to customer" error={patErr.relationship}>
                    <Select
                      value={pat.relationship}
                      onChange={(e) => {
                        // "Customer themself": copy the customer's names, date of birth and gender (from the NIC)
                        const self = e.target.value === "self" ? selfPatientValues(customer) : {};
                        editPat({ relationship: e.target.value, ...self });
                      }}
                    >
                      {RELATIONSHIPS.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {pat.relationship === "other" && (
                    <Field label="Specify relationship" required error={patErr.relationshipOther}>
                      <Input
                        autoFocus
                        value={pat.relationshipOther}
                        maxLength={RELATIONSHIP_OTHER_MAX}
                        onChange={(e) => editPat({ relationshipOther: e.target.value })}
                        onBlur={() => {
                          const r = checkRelationshipOther(pat.relationshipOther);
                          if (r) setPatErr((prev) => ({ ...prev, relationshipOther: [r] }));
                        }}
                        placeholder="e.g. Grandmother, Neighbour"
                      />
                    </Field>
                  )}
                  <Field label="Date of birth" error={patErr.dob}>
                    <Input type="date" max={today} value={pat.dob} onChange={(e) => editPat({ dob: e.target.value })} />
                  </Field>
                  <Field label="Patient's address" error={patErr.address} hint="Leave empty to use the customer's address">
                    <Input value={pat.address} onChange={(e) => editPat({ address: e.target.value })} placeholder={customer.address ?? "Address"} />
                  </Field>
                  <Field label="Care notes" error={patErr.careNotes} className="sm:col-span-2">
                    <Textarea value={pat.careNotes} onChange={(e) => editPat({ careNotes: e.target.value })} placeholder="Condition, mobility, medication times, allergies…" />
                  </Field>
                </div>
              </div>
            )}

            <div className="mt-8 flex gap-2">
              <Button variant="secondary" onClick={() => reset(false)}>
                <ArrowLeft size={16} /> Back
              </Button>
              <Button onClick={continueFromPatient} disabled={pending || patientId === null}>
                {pending ? "Saving…" : "Continue"} <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        )}

        {/* ---------------- STEP 3: SESSION */}
        {step === 2 && customer && patient && (
          <div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Session details</h1>
            <CustomerChip customer={customer} patient={patient} onChange={() => setStep(1)} changeLabel="Change patient" />

            <div className="mt-6 grid max-w-2xl gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <div className="mb-1.5 text-xs font-medium text-ink/80">
                  Package <span className="text-rose-500">*</span>
                </div>
                {packages.length === 0 ? (
                  <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">No packages are set up yet. Ask the Director to add one under Packages.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {packages.map((p) => (
                      <ChoiceCard key={p.id} active={ses.packageId === String(p.id)} onClick={() => setSes({ ...ses, packageId: String(p.id) })}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium">{p.name}</div>
                            <div className="text-xs text-muted">{p.description ?? `${p.durationHours}-hour session`}</div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="font-semibold whitespace-nowrap">{money(p.price)}</div>
                            <div className="text-xs text-muted">{p.durationHours} h</div>
                          </div>
                        </div>
                      </ChoiceCard>
                    ))}
                  </div>
                )}
                {sesErr.packageId && <p className="mt-1 text-xs text-rose-600">{sesErr.packageId[0]}</p>}
              </div>
              <Field label={ses.days > 1 ? "First day" : "Date"} required error={sesErr.serviceDate}>
                <Input type="date" min={today} value={ses.serviceDate} onChange={(e) => setSes({ ...ses, serviceDate: e.target.value })} />
              </Field>
              <Field label="Start time" required error={sesErr.startTime} hint={selectedPackage ? `Session runs ${selectedPackage.durationHours} hours from this time${endsNextDay ? ` (until ${niceTime(endTime)} next day)` : ` (until ${niceTime(endTime)})`}` : undefined}>
                <Input type="time" value={ses.startTime} onChange={(e) => setSes({ ...ses, startTime: e.target.value })} />
              </Field>
              <DaysStepper
                className="sm:col-span-2"
                value={ses.days}
                onChange={(days) => {
                  setSes({ ...ses, days });
                  setSesErr((er) => ({ ...er, days: undefined }));
                }}
                startDate={ses.serviceDate}
                price={selectedPackage?.price}
                error={sesErr.days}
              />

              <div className="sm:col-span-2">
                <div className="mb-1.5 text-xs font-medium text-ink/80">Where is the care?</div>
                <div className="grid grid-cols-2 gap-3">
                  <ChoiceCard active={ses.locationType === "home"} onClick={() => setSes({ ...ses, locationType: "home" })}>
                    <div className="flex items-center gap-2 font-medium">
                      <Home size={16} className="text-accent" /> At home
                    </div>
                  </ChoiceCard>
                  <ChoiceCard active={ses.locationType === "hospital"} onClick={() => setSes({ ...ses, locationType: "hospital" })}>
                    <div className="flex items-center gap-2 font-medium">
                      <Hospital size={16} className="text-accent" /> In a hospital
                    </div>
                  </ChoiceCard>
                </div>
              </div>

              {ses.locationType === "home" ? (
                <Field label="Care address" error={sesErr.serviceAddress} className="sm:col-span-2" hint={defaultAddress && !ses.serviceAddress ? `Will use: ${defaultAddress}` : undefined}>
                  <Input value={ses.serviceAddress} onChange={(e) => setSes({ ...ses, serviceAddress: e.target.value })} placeholder={defaultAddress || "House no, street, town"} />
                </Field>
              ) : (
                <>
                  <Field label="Hospital" required error={sesErr.hospitalId}>
                    <Select value={ses.hospitalId} onChange={(e) => setSes({ ...ses, hospitalId: e.target.value })}>
                      <option value="">Select hospital</option>
                      {hospitals.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name} {h.city ? `(${h.city})` : ""} · {h.type === "private" ? "Private" : "Government"}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Ward no" required error={sesErr.wardNo}>
                      <Input
                        value={ses.wardNo}
                        maxLength={WARD_MAX}
                        onChange={(e) => {
                          setSes({ ...ses, wardNo: e.target.value });
                          setSesErr((er) => ({ ...er, wardNo: undefined }));
                        }}
                        onBlur={() => {
                          const m = checkWardBed(ses.wardNo, "Ward no");
                          if (m) setSesErr((er) => ({ ...er, wardNo: [m] }));
                        }}
                        placeholder="e.g. 5, 12A, ICU"
                      />
                    </Field>
                    <Field label="Bed no" error={sesErr.bedNo}>
                      <Input
                        value={ses.bedNo}
                        maxLength={BED_MAX}
                        onChange={(e) => {
                          setSes({ ...ses, bedNo: e.target.value });
                          setSesErr((er) => ({ ...er, bedNo: undefined }));
                        }}
                        onBlur={() => {
                          const m = ses.bedNo.trim() ? checkWardBed(ses.bedNo, "Bed no") : null;
                          if (m) setSesErr((er) => ({ ...er, bedNo: [m] }));
                        }}
                        placeholder="Optional, e.g. 12"
                      />
                    </Field>
                  </div>
                </>
              )}
              <Field label="Notes for the caregiver" error={sesErr.notes} className="sm:col-span-2">
                <Textarea value={ses.notes} onChange={(e) => setSes({ ...ses, notes: e.target.value })} placeholder="Optional" />
              </Field>
            </div>

            <div className="mt-6 flex max-w-2xl items-center justify-between rounded-2xl border border-white bg-white/70 px-5 py-4">
              <div className="text-sm">
                <div className="font-medium">
                  {nicePeriod(ses.serviceDate, ses.days)} · {niceTime(ses.startTime)}
                  {ses.days > 1 && <span className="ml-1.5 text-muted">({dayCount(ses.days)})</span>}
                </div>
                <div className="text-xs text-muted">
                  {selectedPackage ? `${selectedPackage.name} · ${selectedPackage.durationHours}-hour session${ses.days > 1 ? " each day" : ""}` : "No package selected"} · goes to the call list as Pending
                </div>
              </div>
              <div className="text-right">
                <div className="whitespace-nowrap text-xs text-muted">{ses.days > 1 && selectedPackage ? `${money(selectedPackage.price)} × ${ses.days}` : "Price"}</div>
                <div className="whitespace-nowrap text-lg font-semibold">{selectedPackage ? money(Number(selectedPackage.price) * ses.days) : "—"}</div>
              </div>
            </div>

            <div className="mt-8 flex gap-2">
              <Button variant="secondary" onClick={() => setStep(1)}>
                <ArrowLeft size={16} /> Back
              </Button>
              <Button onClick={submitBooking} disabled={pending}>
                {pending ? "Saving…" : "Record booking"} <Check size={16} />
              </Button>
            </div>
          </div>
        )}

        {/* ---------------- DONE */}
        {step === 3 && done && (
          <div className="flex h-full flex-col items-center justify-center py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <Check size={30} />
            </div>
            <h1 className="mt-5 text-2xl font-semibold">Booking {done.bookingNo} recorded</h1>
            <p className="mt-1 text-sm text-muted">
              It&apos;s on the call list as Pending for {niceDate(ses.serviceDate)}
              {ses.days > 1 ? ` (${dayCount(ses.days)}, until ${niceDate(endDateOf(ses.serviceDate, ses.days))})` : ""}.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-2">
              <WhatsappShare kind="booking" id={done.id} docNo={done.bookingNo} customerId={done.customerId} number={done.whatsappNumber} />
              <LinkButton href={`/bookings/${done.bookingNo}/print`} variant="secondary">
                <Printer size={16} /> Print booking
              </LinkButton>
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <LinkButton href={`/bookings/${done.bookingNo}`} variant="secondary">
                View booking
              </LinkButton>
              <Button variant="secondary" onClick={() => reset(true)}>
                Another session for {customer?.fullName.split(" ")[0]}
              </Button>
              <Button onClick={() => reset(false)}>New customer booking</Button>
            </div>
            <Link href="/call-list" className="mt-4 text-sm text-accent hover:underline">
              Go to the call list
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

function CustomerChip({ customer, patient, onChange, changeLabel = "Change" }: { customer: Customer; patient?: Patient; onChange: () => void; changeLabel?: string }) {
  return (
    <div className="mt-3 inline-flex max-w-full items-center gap-3 rounded-2xl border border-white bg-white/70 py-2 pl-2 pr-4">
      <Avatar name={customer.fullName} size="sm" />
      <div className="min-w-0 text-sm">
        <span className="font-medium">{customer.fullName}</span>
        <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted">
          <Phone size={11} /> {customer.phone}
        </span>
        {patient && <span className="ml-2 text-xs text-muted">· for {patient.fullName}</span>}
      </div>
      <button onClick={onChange} className="text-xs font-medium text-accent hover:underline">
        {changeLabel}
      </button>
    </div>
  );
}

function ChoiceCard({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border p-3.5 text-left transition",
        active ? "border-accent bg-white shadow-[0_0_0_3px_rgba(102,88,245,0.12)]" : "border-white bg-white/55 hover:bg-white/80",
      )}
    >
      {children}
    </button>
  );
}

/** Removes the error of every field whose value actually changed. */
function dropErrors<T extends object>(errors: Errors, patch: Partial<T>, current: T): Errors {
  const next = { ...errors };
  for (const [k, v] of Object.entries(patch)) if (v !== current[k as keyof T]) delete next[k];
  return next;
}

/** Drops empty strings so optional fields stay optional. */
function clean<T extends Record<string, string>>(o: T) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "")) as Partial<T> & T;
}
