"use client";

import { Plus, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action";
import { Button, cn, Field, Input, Select, Textarea, type ButtonVariant } from "@/components/ui";
import { Dialog } from "@/components/ui/client";
import { parseNic } from "@/lib/lk-rules";

export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "email" | "password" | "date" | "number" | "textarea" | "select" | "checkbox" | "radio";
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  hint?: string;
  full?: boolean; // span the whole row
  third?: boolean; // one third of the row (e.g. first / middle / last name)
  numeric?: boolean; // send as number (ids)
  maxLength?: number;
  /** NIC box: leaving it fills Date of birth (and Gender, if the form has them) from the NIC. */
  nic?: boolean;
  /** Only show (and send) this field while another field has a given value, e.g. relationship = "other". */
  showWhen?: { field: string; value: string };
  createOnly?: boolean;
  editOnly?: boolean;
};

type Values = Record<string, string | boolean>;

/** 6-column grid: half row by default, full row, or a third. */
const span = (f: FieldDef) => (f.full ? "sm:col-span-6" : f.third ? "sm:col-span-2" : "sm:col-span-3");

/**
 * A button that opens a glass dialog with a form, built from a list of fields,
 * and saves through a server action (protectedAction).
 *  - create mode: empty fields are left out
 *  - edit mode:   emptied fields are sent as null (to clear them)
 */
export function EntityFormButton<R>({
  title,
  subtitle,
  fields,
  initial,
  action,
  extra,
  mode,
  buttonLabel,
  buttonVariant,
  buttonSize = "md",
  success,
  wide,
  onSaved,
  icon,
  autoFill,
}: {
  title: string;
  subtitle?: string;
  fields: FieldDef[];
  initial?: Values;
  action: (input: never) => Promise<ActionResult<R>>; // any protectedAction; input is validated on the server
  extra?: Record<string, unknown>; // e.g. { id }
  mode: "create" | "edit";
  buttonLabel?: string;
  buttonVariant?: ButtonVariant;
  buttonSize?: "sm" | "md";
  success?: string;
  wide?: boolean;
  onSaved?: (data: R) => void;
  icon?: ReactNode;
  /** When `field` is set to `value`, copy `values` into the form (e.g. relationship "self" → the customer's details). */
  autoFill?: { field: string; value: string; values: Values };
}) {
  const visible = fields.filter((f) => (mode === "create" ? !f.editOnly : !f.createOnly));
  const start = () => Object.fromEntries(visible.map((f) => [f.name, initial?.[f.name] ?? (f.type === "checkbox" ? false : "")])) as Values;

  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Values>(start);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, startT] = useTransition();
  const shown = visible.filter((f) => !f.showWhen || values[f.showWhen.field] === f.showWhen.value);
  const router = useRouter();

  /** A valid NIC replaces the date of birth and gender with what the NIC says. */
  function fillFromNic(raw: string) {
    const n = raw.trim() ? parseNic(raw) : null;
    if (!n || "error" in n) return;
    const has = (name: string) => visible.some((f) => f.name === name);
    setValues((s) => ({ ...s, ...(has("dob") ? { dob: n.dob } : {}), ...(has("gender") ? { gender: n.gender } : {}) }));
    setErrors((e) => ({ ...e, nic: undefined, dob: undefined, gender: undefined }));
  }

  function submit() {
    const payload: Record<string, unknown> = { ...extra };
    for (const f of shown) {
      const v = values[f.name];
      if (typeof v === "boolean") payload[f.name] = v;
      else if (v === "") {
        if (mode === "edit" && !f.required && f.type !== "password") payload[f.name] = null;
      } else payload[f.name] = f.numeric ? Number(v) : v;
    }
    startT(async () => {
      const r = await action(payload as never);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      toast.success(success ?? "Saved");
      setOpen(false);
      onSaved?.(r.data);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant={buttonVariant ?? (mode === "create" ? "primary" : "secondary")}
        size={buttonSize}
        onClick={() => {
          setValues(start());
          setErrors({});
          setOpen(true);
        }}
      >
        {icon ?? (mode === "create" ? <Plus size={15} /> : <Pencil size={14} />)} {buttonLabel ?? (mode === "create" ? "Add" : "Edit")}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title} subtitle={subtitle} wide={wide}>
        <form
          noValidate // our own checks show the messages, not the browser's pop-ups
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-6">
            {shown.map((f) => {
              const v = values[f.name];
              const set = (nv: string | boolean) => {
                const fill = autoFill && autoFill.field === f.name && nv === autoFill.value ? autoFill.values : {};
                setValues((s) => ({ ...s, ...fill, [f.name]: nv }));
                if (Object.keys(fill).length) setErrors((e) => ({ ...e, ...Object.fromEntries(Object.keys(fill).map((k) => [k, undefined])) }));
              };
              if (f.type === "checkbox") {
                return (
                  <label key={f.name} className={cn("flex items-center gap-2.5 text-sm", span(f))}>
                    <input
                      type="checkbox"
                      checked={Boolean(v)}
                      onChange={(e) => set(e.target.checked)}
                      className="h-4 w-4 accent-[#6658f5]"
                    />
                    {f.label}
                  </label>
                );
              }
              return (
                <Field key={f.name} label={f.label} required={f.required} error={errors[f.name]} hint={f.hint} className={span(f)}>
                  {f.type === "textarea" ? (
                    <Textarea value={String(v)} onChange={(e) => set(e.target.value)} placeholder={f.placeholder} />
                  ) : f.type === "select" ? (
                    <Select value={String(v)} onChange={(e) => set(e.target.value)}>
                      {!f.required && <option value="">—</option>}
                      {f.required && !v && <option value="">Select…</option>}
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  ) : f.type === "radio" ? (
                    <div className="flex gap-5 pt-1">
                      {f.options?.map((o) => (
                        <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm">
                          <span
                            className={cn(
                              "flex h-5 w-5 items-center justify-center rounded-md border-2",
                              v === o.value ? "border-accent bg-accent-soft" : "border-[#c7cbee] bg-white/70",
                            )}
                          >
                            {v === o.value && <span className="h-2.5 w-2.5 rounded-sm bg-accent" />}
                          </span>
                          <input type="radio" className="sr-only" checked={v === o.value} onChange={() => set(o.value)} />
                          {o.label}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <Input
                      type={f.type ?? "text"}
                      value={String(v)}
                      onChange={(e) => set(f.nic ? e.target.value.toUpperCase().replace(/[^0-9VX]/g, "") : e.target.value)}
                      onBlur={f.nic ? () => fillFromNic(String(v)) : undefined}
                      placeholder={f.placeholder}
                      maxLength={f.nic ? 12 : f.maxLength}
                      autoComplete={f.type === "password" ? "new-password" : undefined}
                    />
                  )}
                </Field>
              );
            })}
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
