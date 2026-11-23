"use client";

import { cn, Field, Input } from "@/components/ui";
import { NAME_LIMITS } from "@/lib/lk-rules";

export type NameValue = { firstName: string; middleName: string; lastName: string };
type NameKey = keyof NameValue;

/** First / middle / last name inputs in one row (stacked on phones). */
export function NameFields({
  value,
  onChange,
  errors = {},
  onBlur,
  className,
  autoFocus,
}: {
  value: NameValue;
  onChange: (next: NameValue) => void;
  errors?: Partial<Record<NameKey, string | string[] | undefined>>;
  onBlur?: (field: NameKey) => void;
  className?: string;
  autoFocus?: boolean;
}) {
  const parts: { key: NameKey; label: string; required: boolean; placeholder: string }[] = [
    { key: "firstName", label: "First name", required: true, placeholder: "e.g. Nimali" },
    { key: "middleName", label: "Middle name", required: false, placeholder: "Optional" },
    { key: "lastName", label: "Last name", required: true, placeholder: "e.g. Perera" },
  ];
  return (
    <div className={cn("grid gap-4 sm:grid-cols-3", className)}>
      {parts.map((p, i) => (
        <Field key={p.key} label={p.label} required={p.required} error={errors[p.key]}>
          <Input
            name={p.key}
            autoFocus={autoFocus && i === 0}
            value={value[p.key]}
            maxLength={NAME_LIMITS[p.key]}
            autoComplete={p.key === "firstName" ? "given-name" : p.key === "lastName" ? "family-name" : "additional-name"}
            onChange={(e) => onChange({ ...value, [p.key]: e.target.value })}
            onBlur={() => onBlur?.(p.key)}
            placeholder={p.placeholder}
          />
        </Field>
      ))}
    </div>
  );
}
