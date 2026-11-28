"use client";

import { MessageCircle } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn, Field, Input } from "@/components/ui";

/** WhatsApp green, used only for the WhatsApp bits. */
export const WA_GREEN = "#1fa855";

/**
 * A phone box with a "WhatsApp" tick in front of it.
 * The tick is on by default; untick it when that number is not on WhatsApp.
 */
export function PhoneWithWhatsapp({
  label,
  required,
  value,
  onChange,
  onBlur,
  whatsapp,
  onWhatsapp,
  error,
  hint,
  placeholder,
  className,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  whatsapp: boolean;
  onWhatsapp: (on: boolean) => void;
  error?: string | string[];
  hint?: string;
  placeholder?: string;
  className?: string;
}) {
  const id = useId();
  const msg = Array.isArray(error) ? error[0] : error;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-xs font-medium text-ink/80">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </label>
      <div className="flex gap-2">
        <label
          title={whatsapp ? "This number is on WhatsApp (untick if it isn't)" : "Tick if this number is on WhatsApp"}
          className={cn(
            "flex shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-xl border px-2.5 text-xs font-medium transition",
            whatsapp ? "border-[#1fa855]/40 bg-[#1fa855]/10 text-[#13793c]" : "border-[#c7cbee] bg-white/60 text-muted",
          )}
        >
          <input
            type="checkbox"
            checked={whatsapp}
            onChange={(e) => onWhatsapp(e.target.checked)}
            className="h-4 w-4 accent-[#1fa855]"
            aria-label={`${label} is on WhatsApp`}
          />
          <MessageCircle size={14} />
          WhatsApp
        </label>
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d+\s-]/g, ""))}
          onBlur={onBlur}
          inputMode="tel"
          maxLength={16}
          placeholder={placeholder}
          className="min-w-0 flex-1"
        />
      </div>
      {msg ? <span className="block text-xs text-rose-600">{msg}</span> : hint ? <span className="block text-xs text-muted">{hint}</span> : null}
    </div>
  );
}

/** Pops up when neither phone is ticked: the customer's WhatsApp number (optional). */
export function WhatsappNumberField({
  value,
  onChange,
  onBlur,
  error,
  className,
  extra,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  error?: string | string[];
  className?: string;
  extra?: ReactNode;
}) {
  return (
    <div className={cn("pop-in rounded-2xl border border-[#1fa855]/30 bg-[#1fa855]/[0.06] p-3.5", className)}>
      <Field
        label="WhatsApp number"
        error={error}
        hint="Neither phone is on WhatsApp. Enter the number invoices should go to, or leave it empty if the customer doesn't use WhatsApp."
      >
        <div className="relative">
          <MessageCircle size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#1fa855]" />
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/[^\d+\s-]/g, ""))}
            onBlur={onBlur}
            inputMode="tel"
            maxLength={16}
            placeholder="07XXXXXXXX (optional)"
            className="pl-9"
            autoFocus
          />
        </div>
      </Field>
      {extra}
    </div>
  );
}
