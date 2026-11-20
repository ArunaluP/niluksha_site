"use client";

import { ArrowLeft, ArrowRight, Check, HeartPulse, Home, Hospital, Phone, Plus, Search, UserPlus } from "lucide-react";
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
import { Avatar, Button, cn, Field, Input, LinkButton, money, niceDate, niceTime, Select, Textarea } from "@/components/ui";

type Patient = { id: number; patientNo: string; fullName: string; gender: "male" | "female"; relationship: string; address: string | null; careNotes: string | null };
type Customer = { id: number; customerNo: string; fullName: string; phone: string; altPhone: string | null; nic: string | null; address: string | null; city: string | null; patients: Patient[] };
type SearchHit = { id: number; customerNo: string; fullName: string; phone: string; nic: string | null; city: string | null; patientCount: number };
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
  rate,
  today,
  initialCustomer,
}: {
  hospitals: HospitalOpt[];
  rate: string;
  today: string;
  initialCustomer: Customer | null;
}) {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(initialCustomer ? 1 : 0);
  const [customer, setCustomer] = useState<Customer | null>(initialCustomer);
  const [patientId, setPatientId] = useState<number | "new" | null>(initialCustomer?.patients[0]?.id ?? null);
  const [done, setDone] = useState<{ id: number; bookingNo: string } | null>(null);
  const [pending, start] = useTransition();

  // ---------------- step 1: customer
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [newCust, setNewCust] = useState(false);
  const [cust, setCust] = useState({ fullName: "", phone: "", altPhone: "", nic: "", address: "", city: "" });
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

  function saveCustomer() {
    start(async () => {
      const r = await createCustomerAction(clean(cust));
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
  const [pat, setPat] = useState({ fullName: "", gender: "" as "" | "male" | "female", relationship: "parent", dob: "", address: "", careNotes: "" });
  const [patErr, setPatErr] = useState<Errors>({});
  const patient = customer?.patients.find((p) => p.id === patientId) ?? null;

  function continueFromPatient() {
    if (patientId !== "new") return setStep(2);
    start(async () => {
      const r = await addPatientAction({ customerId: customer!.id, ...clean(pat), gender: pat.gender || undefined } as Parameters<typeof addPatientAction>[0]);
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
  const [ses, setSes] = useState({ serviceDate: today, startTime: "08:00", locationType: "home" as "home" | "hospital", hospitalId: "", wardRoom: "", serviceAddress: "", notes: "" });
  const [sesErr, setSesErr] = useState<Errors>({});
  const defaultAddress = patient?.address || customer?.address || "";

  function submitBooking() {
    start(async () => {
      const r = await createBookingAction({
        customerId: customer!.id,
        patientId: patient!.id,
        serviceDate: ses.serviceDate,
        startTime: ses.startTime,
        locationType: ses.locationType,
        hospitalId: ses.locationType === "hospital" && ses.hospitalId ? Number(ses.hospitalId) : undefined,
        wardRoom: ses.locationType === "hospital" ? ses.wardRoom || undefined : undefined,
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
    setSes({ serviceDate: today, startTime: "08:00", locationType: "home", hospitalId: "", wardRoom: "", serviceAddress: "", notes: "" });
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
          One session = 24 hours of care · {money(rate)}. The booking goes to the call list for confirmation.
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
                  <Field label="Full name" required error={custErr.fullName} className="sm:col-span-2">
                    <Input value={cust.fullName} onChange={(e) => setCust({ ...cust, fullName: e.target.value })} placeholder="Customer's full name" />
                  </Field>
                  <Field label="Phone number" required error={custErr.phone}>
                    <Input value={cust.phone} onChange={(e) => setCust({ ...cust, phone: e.target.value })} placeholder="0771234567" />
                  </Field>
                  <Field label="Other phone" error={custErr.altPhone}>
                    <Input value={cust.altPhone} onChange={(e) => setCust({ ...cust, altPhone: e.target.value })} placeholder="Optional" />
                  </Field>
                  <Field label="NIC" error={custErr.nic}>
                    <Input value={cust.nic} onChange={(e) => setCust({ ...cust, nic: e.target.value })} placeholder="199012345678" />
                  </Field>
                  <Field label="City" error={custErr.city}>
                    <Input value={cust.city} onChange={(e) => setCust({ ...cust, city: e.target.value })} placeholder="Kadawatha" />
                  </Field>
                  <Field label="Address" error={custErr.address} className="sm:col-span-2" hint="Used as the care address for home sessions unless the patient has their own.">
                    <Input value={cust.address} onChange={(e) => setCust({ ...cust, address: e.target.value })} placeholder="House no, street, town" />
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
                    {p.relationship === "self" ? "Customer themself" : p.relationship} · {p.gender} · {p.patientNo}
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
                        <input type="radio" name="gender" className="sr-only" checked={pat.gender === g} onChange={() => setPat({ ...pat, gender: g })} />
                        {g === "female" ? "Woman" : "Man"}
                      </label>
                    ))}
                  </div>
                  {patErr.gender && <p className="mt-1 text-xs text-rose-600">{patErr.gender[0]}</p>}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Patient's full name" required error={patErr.fullName}>
                    <Input value={pat.fullName} onChange={(e) => setPat({ ...pat, fullName: e.target.value })} placeholder="e.g. Mrs. Lalitha Perera" />
                  </Field>
                  <Field label="Relationship to customer" error={patErr.relationship}>
                    <Select
                      value={pat.relationship}
                      onChange={(e) => setPat({ ...pat, relationship: e.target.value, fullName: e.target.value === "self" && !pat.fullName ? customer.fullName : pat.fullName })}
                    >
                      {RELATIONSHIPS.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Date of birth" error={patErr.dob}>
                    <Input type="date" max={today} value={pat.dob} onChange={(e) => setPat({ ...pat, dob: e.target.value })} />
                  </Field>
                  <Field label="Patient's address" error={patErr.address} hint="Leave empty to use the customer's address">
                    <Input value={pat.address} onChange={(e) => setPat({ ...pat, address: e.target.value })} placeholder={customer.address ?? "Address"} />
                  </Field>
                  <Field label="Care notes" error={patErr.careNotes} className="sm:col-span-2">
                    <Textarea value={pat.careNotes} onChange={(e) => setPat({ ...pat, careNotes: e.target.value })} placeholder="Condition, mobility, medication times, allergies…" />
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
              <Field label="Date" required error={sesErr.serviceDate}>
                <Input type="date" min={today} value={ses.serviceDate} onChange={(e) => setSes({ ...ses, serviceDate: e.target.value })} />
              </Field>
              <Field label="Start time" required error={sesErr.startTime} hint="Session runs 24 hours from this time">
                <Input type="time" value={ses.startTime} onChange={(e) => setSes({ ...ses, startTime: e.target.value })} />
              </Field>

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
                  <Field label="Ward / room" error={sesErr.wardRoom}>
                    <Input value={ses.wardRoom} onChange={(e) => setSes({ ...ses, wardRoom: e.target.value })} placeholder="e.g. Ward 5, Bed 12" />
                  </Field>
                </>
              )}
              <Field label="Notes for the caregiver" error={sesErr.notes} className="sm:col-span-2">
                <Textarea value={ses.notes} onChange={(e) => setSes({ ...ses, notes: e.target.value })} placeholder="Optional" />
              </Field>
            </div>

            <div className="mt-6 flex max-w-2xl items-center justify-between rounded-2xl border border-white bg-white/70 px-5 py-4">
              <div className="text-sm">
                <div className="font-medium">
                  {niceDate(ses.serviceDate)} · {niceTime(ses.startTime)}
                </div>
                <div className="text-xs text-muted">24-hour session · goes to the call list as Pending</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted">Rate</div>
                <div className="text-lg font-semibold">{money(rate)}</div>
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
            <p className="mt-1 text-sm text-muted">It&apos;s on the call list as Pending for {niceDate(ses.serviceDate)}.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              <LinkButton href={`/bookings/${done.id}`} variant="secondary">
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

/** Drops empty strings so optional fields stay optional. */
function clean<T extends Record<string, string>>(o: T) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "")) as Partial<T> & T;
}
