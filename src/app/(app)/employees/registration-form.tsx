"use client";

import { ArrowLeft, Check, FileSignature, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { WebcamPhoto } from "@/components/app/webcam-photo";
import { Button, Card, cn, Field, Input, Select, Textarea } from "@/components/ui";
import { DISTRICTS, DOCUMENTS, HEARD_FROM, HEARD_FROM_LABELS, RULES, declarationText, type DocumentKey } from "@/features/employees/registration";
import { parseNic } from "@/lib/lk-rules";
import { createEmployeeAction, updateEmployeeAction } from "../_actions/records";

type Text = Record<string, string>;

/** Text boxes (all sent as strings; "" = empty). */
const TEXT_FIELDS = [
  "fileNo", "designation", "branchId", "joinDate", "status",
  "firstName", "lastName", "nic", "gender", "dob", "phone", "altPhone", "email", "address", "gnDivision", "district", "nearestPolice", "nearestPostOffice", "qualifications",
  "guardianName", "guardianRelationship", "guardianAddress", "guardianPhone",
  "heardFrom", "referredBy",
] as const;
const REQUIRED = new Set(["designation", "branchId", "firstName", "lastName", "gender", "phone", "status"]);
const NUMERIC = new Set(["branchId", "referredBy"]);

export type RegistrationInitial = Partial<Record<(typeof TEXT_FIELDS)[number], string>> & { docs?: Partial<Record<DocumentKey, boolean>>; rulesAgreed?: boolean };

/**
 * The employee registration form (the company's paper form, in English).
 * Used for "Add employee" and "Edit employee".
 */
export function RegistrationForm({
  mode,
  employeeId,
  empNo,
  initial,
  branches,
  referrers,
  designations,
  company,
  photoUrl,
  agreedNote,
}: {
  mode: "create" | "edit";
  employeeId?: number;
  empNo?: string;
  initial: RegistrationInitial;
  branches: { id: number; name: string }[];
  referrers: { id: number; empNo: string; fileNo: string | null; fullName: string }[];
  designations: readonly string[];
  company: string;
  photoUrl?: string | null;
  /** "Agreed on 26 Nov 2026 · recorded by Kamal" (edit mode) */
  agreedNote?: string | null;
}) {
  const router = useRouter();
  const [pending, startT] = useTransition();
  const [v, setV] = useState<Text>(() => Object.fromEntries(TEXT_FIELDS.map((k) => [k, initial[k] ?? ""])));
  const [docs, setDocs] = useState<Record<DocumentKey, boolean>>(() => Object.fromEntries(DOCUMENTS.map((d) => [d.key, Boolean(initial.docs?.[d.key])])) as Record<DocumentKey, boolean>);
  const [agreed, setAgreed] = useState(Boolean(initial.rulesAgreed));
  const [photo, setPhoto] = useState<string | null>(null); // null = unchanged
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});

  const set = (k: string, val: string) => {
    setV((s) => ({ ...s, [k]: val }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const err = (k: string) => errors[k];

  /** A valid NIC fills date of birth and gender. */
  function fillFromNic() {
    const n = v.nic.trim() ? parseNic(v.nic) : null;
    if (!n || "error" in n) return;
    setV((s) => ({ ...s, dob: n.dob, gender: n.gender }));
    setErrors((e) => ({ ...e, nic: undefined, dob: undefined, gender: undefined }));
  }

  function submit() {
    const payload: Record<string, unknown> = mode === "edit" ? { id: employeeId } : {};
    for (const k of TEXT_FIELDS) {
      if (k === "status" && mode === "create") continue;
      const val = v[k].trim();
      if (k === "referredBy" && v.heardFrom !== "employee") {
        if (mode === "edit") payload[k] = null;
        continue;
      }
      if (val === "") {
        if (mode === "edit" && !REQUIRED.has(k)) payload[k] = null;
      } else payload[k] = NUMERIC.has(k) ? Number(val) : val;
    }
    // The middle name is no longer on the form: on edit it was merged into the first name box.
    if (mode === "edit") payload.middleName = null;
    Object.assign(payload, docs, { rulesAgreed: agreed });
    if (photo !== null) payload.photo = photo === "" ? null : photo;
    if (mode === "create" && !payload.photo) delete payload.photo;

    startT(async () => {
      const r = mode === "create" ? await createEmployeeAction(payload as never) : await updateEmployeeAction(payload as never);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      toast.success(mode === "create" ? "Employee registered" : "Employee updated");
      const id = mode === "create" ? (r.data as { id: number }).id : employeeId;
      router.push(`/employees/${id}`);
      router.refresh();
    });
  }

  const back = mode === "create" ? "/employees" : `/employees/${employeeId}`;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Link href={back} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={15} /> {mode === "create" ? "Employees" : "Back to employee"}
      </Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{mode === "create" ? "Register employee" : "Edit employee"}</h1>
          <p className="mt-1 text-sm text-muted">
            {mode === "create" ? "Employee registration form · a system number (EMP-…) is created automatically" : `Employee registration form · ${empNo}`}
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px] lg:items-start">
        <div className="space-y-5">
          {/* 1. Source */}
          <Section title="How did they hear about us?" subtitle="Tick one">
            <div className="flex flex-wrap gap-2">
              {HEARD_FROM.map((h) => (
                <Chip key={h} on={v.heardFrom === h} onClick={() => set("heardFrom", v.heardFrom === h ? "" : h)}>
                  {HEARD_FROM_LABELS[h]}
                </Chip>
              ))}
            </div>
            {err("heardFrom") && <p className="mt-2 text-xs text-rose-600">{err("heardFrom")![0]}</p>}
            {v.heardFrom === "employee" && (
              <Field label="Referred by (employee)" error={err("referredBy")} className="pop-in mt-4 max-w-md">
                <Select value={v.referredBy} onChange={(e) => set("referredBy", e.target.value)}>
                  <option value="">Select employee…</option>
                  {referrers
                    .filter((r) => r.id !== employeeId)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.fullName} · {r.fileNo ? `${r.fileNo} / ` : ""}
                        {r.empNo}
                      </option>
                    ))}
                </Select>
              </Field>
            )}
          </Section>

          {/* 2. Employee / job */}
          <Section title="Employment">
            <Grid>
              <Field label="Employee number" error={err("fileNo")} hint="The number on the paper form" className="sm:col-span-2">
                <Input value={v.fileNo} onChange={(e) => set("fileNo", e.target.value.toUpperCase())} placeholder="e.g. 1045" maxLength={30} />
              </Field>
              <Field label="System number" hint="Given by the system" className="sm:col-span-2">
                <Input value={empNo ?? "Created on save"} disabled readOnly />
              </Field>
              <Field label="Date" error={err("joinDate")} hint="Registration / join date" className="sm:col-span-2">
                <Input type="date" value={v.joinDate} onChange={(e) => set("joinDate", e.target.value)} />
              </Field>
              <Field label="Type" required error={err("designation")} className="sm:col-span-2">
                <Select value={v.designation} onChange={(e) => set("designation", e.target.value)}>
                  {designations.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Branch" required error={err("branchId")} className="sm:col-span-2">
                <Select value={v.branchId} onChange={(e) => set("branchId", e.target.value)}>
                  {!v.branchId && <option value="">Select…</option>}
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {mode === "edit" && (
                <Field label="Status" required error={err("status")} className="sm:col-span-2">
                  <Select value={v.status} onChange={(e) => set("status", e.target.value)}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive (left / suspended)</option>
                  </Select>
                </Field>
              )}
            </Grid>
          </Section>

          {/* 3. Personal details */}
          <Section title="Personal details">
            <Grid>
              <Field label="First name" required error={err("firstName")} className="sm:col-span-3">
                <Input value={v.firstName} onChange={(e) => set("firstName", e.target.value)} maxLength={60} />
              </Field>
              <Field label="Last name" required error={err("lastName")} className="sm:col-span-3">
                <Input value={v.lastName} onChange={(e) => set("lastName", e.target.value)} maxLength={60} />
              </Field>
              <Field label="NIC number" error={err("nic")} hint="Fills date of birth and gender" className="sm:col-span-2">
                <Input value={v.nic} onChange={(e) => set("nic", e.target.value.toUpperCase().replace(/[^0-9VX]/g, ""))} onBlur={fillFromNic} placeholder="199012345678" maxLength={12} />
              </Field>
              <Field label="Date of birth" error={err("dob")} className="sm:col-span-2">
                <Input type="date" value={v.dob} onChange={(e) => set("dob", e.target.value)} />
              </Field>
              <div className="space-y-1.5 sm:col-span-2">
                <span className="block text-xs font-medium text-ink/80">
                  Gender<span className="text-rose-500"> *</span>
                </span>
                <div className="flex gap-2">
                  {[
                    ["female", "Woman"],
                    ["male", "Man"],
                  ].map(([val, label]) => (
                    <Chip key={val} on={v.gender === val} onClick={() => set("gender", val)}>
                      {label}
                    </Chip>
                  ))}
                </div>
                {err("gender") && <span className="block text-xs text-rose-600">{err("gender")![0]}</span>}
              </div>
              <Field label="Phone number" required error={err("phone")} className="sm:col-span-2">
                <Input value={v.phone} onChange={(e) => set("phone", e.target.value)} placeholder="0771234567" inputMode="tel" />
              </Field>
              <Field label="Other phone" error={err("altPhone")} className="sm:col-span-2">
                <Input value={v.altPhone} onChange={(e) => set("altPhone", e.target.value)} inputMode="tel" />
              </Field>
              <Field label="Email" error={err("email")} className="sm:col-span-2">
                <Input type="email" value={v.email} onChange={(e) => set("email", e.target.value)} placeholder="Optional" maxLength={160} />
              </Field>
              <Field label="Address" error={err("address")} className="sm:col-span-6">
                <Input value={v.address} onChange={(e) => set("address", e.target.value)} maxLength={255} />
              </Field>
              <Field label="Grama Niladhari division" error={err("gnDivision")} className="sm:col-span-3">
                <Input value={v.gnDivision} onChange={(e) => set("gnDivision", e.target.value)} placeholder="e.g. 123 Kadawatha North" maxLength={100} />
              </Field>
              <Field label="District" error={err("district")} className="sm:col-span-3">
                <Select value={v.district} onChange={(e) => set("district", e.target.value)}>
                  <option value="">—</option>
                  {DISTRICTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Nearest police station" error={err("nearestPolice")} className="sm:col-span-3">
                <Input value={v.nearestPolice} onChange={(e) => set("nearestPolice", e.target.value)} maxLength={100} />
              </Field>
              <Field label="Nearest post office" error={err("nearestPostOffice")} className="sm:col-span-3">
                <Input value={v.nearestPostOffice} onChange={(e) => set("nearestPostOffice", e.target.value)} maxLength={100} />
              </Field>
              <Field label="Qualifications / skills" error={err("qualifications")} className="sm:col-span-6">
                <Textarea value={v.qualifications} onChange={(e) => set("qualifications", e.target.value)} />
              </Field>
            </Grid>
          </Section>

          {/* 4. Guardian */}
          <Section title="Guardian details">
            <Grid>
              <Field label="Name" error={err("guardianName")} className="sm:col-span-3">
                <Input value={v.guardianName} onChange={(e) => set("guardianName", e.target.value)} maxLength={160} />
              </Field>
              <Field label="Relationship" error={err("guardianRelationship")} className="sm:col-span-3">
                <Input value={v.guardianRelationship} onChange={(e) => set("guardianRelationship", e.target.value)} placeholder="e.g. Mother, Husband" maxLength={60} />
              </Field>
              <Field label="Address" error={err("guardianAddress")} className="sm:col-span-4">
                <Input value={v.guardianAddress} onChange={(e) => set("guardianAddress", e.target.value)} maxLength={255} />
              </Field>
              <Field label="Phone number" error={err("guardianPhone")} className="sm:col-span-2">
                <Input value={v.guardianPhone} onChange={(e) => set("guardianPhone", e.target.value)} inputMode="tel" />
              </Field>
            </Grid>
          </Section>

          {/* 5. Documents */}
          <Section title="Documents received" subtitle="Tick each document handed over">
            <div className="grid gap-2 sm:grid-cols-2">
              {DOCUMENTS.map((d) => (
                <Tick key={d.key} on={docs[d.key]} onChange={(on) => setDocs((s) => ({ ...s, [d.key]: on }))}>
                  {d.label}
                </Tick>
              ))}
            </div>
          </Section>

          {/* 6. Rules & agreement */}
          <Section title="Rules & agreement">
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink/85">
              {RULES.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
            <p className="mt-4 rounded-xl bg-white/60 p-3 text-sm leading-relaxed text-ink/80">{declarationText(company)}</p>
            <div className="mt-4">
              <Tick on={agreed} onChange={setAgreed} strong>
                The employee has read and agreed to these rules and the declaration
              </Tick>
              {agreed && agreedNote && <p className="mt-1.5 pl-1 text-xs text-muted">{agreedNote}</p>}
              <p className="mt-1.5 pl-1 text-xs text-muted">Signatures are taken on the printed form (Employee page → Print form, English or සිංහල).</p>
            </div>
          </Section>
        </div>

        {/* Photo (sticky on large screens) */}
        <div className="space-y-5 lg:sticky lg:top-6">
          <Section title="Photo" subtitle="Taken with the webcam">
            <WebcamPhoto value={photo} current={photoUrl} onChange={setPhoto} error={err("photo")} />
          </Section>
          <Card className="space-y-2 p-4">
            <Button type="submit" className="w-full" disabled={pending}>
              <Save size={15} /> {pending ? "Saving…" : mode === "create" ? "Register employee" : "Save changes"}
            </Button>
            <Link href={back} className="block text-center text-sm text-muted hover:text-ink">
              Cancel
            </Link>
            {mode === "edit" && (
              <div className="space-y-1">
                <div className="text-center text-xs text-muted">Print form (saved details)</div>
                <div className="flex justify-center gap-4">
                  <Link href={`/employees/${employeeId}/form`} className="flex items-center gap-1.5 text-sm text-muted hover:text-ink">
                    <FileSignature size={14} /> English
                  </Link>
                  <Link href={`/employees/${employeeId}/form?lang=si`} className="flex items-center gap-1.5 text-sm text-muted hover:text-ink">
                    <FileSignature size={14} /> සිංහල
                  </Link>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </form>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-4">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {children}
    </Card>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-6">{children}</div>;
}

/** A pill you click to choose (one of a group). */
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-sm transition",
        on ? "border-accent/40 bg-accent-soft font-medium text-accent" : "border-[#c7cbee] bg-white/60 text-ink/80 hover:bg-white",
      )}
    >
      {on && <Check size={14} />}
      {children}
    </button>
  );
}

/** A tick box row. */
function Tick({ on, onChange, children, strong }: { on: boolean; onChange: (on: boolean) => void; children: ReactNode; strong?: boolean }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer select-none items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition",
        on ? "border-emerald-200 bg-emerald-50/80 text-emerald-900" : "border-white bg-white/55 text-ink/85 hover:bg-white/80",
        strong && "font-medium",
      )}
    >
      <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2", on ? "border-emerald-500 bg-emerald-500 text-white" : "border-[#c7cbee] bg-white")}>
        {on && <Check size={13} strokeWidth={3} />}
      </span>
      <input type="checkbox" className="sr-only" checked={on} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}
