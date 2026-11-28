"use client";

import { Minus, Plus } from "lucide-react";
import { cn, dayCount, money, nicePeriod } from "@/components/ui";
import { MAX_BOOKING_DAYS } from "@/lib/dates";

/**
 * Number of days for a booking: − [ 5 ] +  (1–30).
 * Below it: the period ("5 – 9 Dec 2026") and the total (price × days).
 */
export function DaysStepper({
  value,
  onChange,
  startDate,
  price,
  error,
  className,
}: {
  value: number;
  onChange: (days: number) => void;
  startDate?: string;
  price?: string | number | null;
  error?: string | string[];
  className?: string;
}) {
  const clamp = (n: number) => Math.min(MAX_BOOKING_DAYS, Math.max(1, Math.round(n) || 1));
  const msg = Array.isArray(error) ? error[0] : error;
  return (
    <div className={cn("space-y-1.5", className)}>
      <span className="block text-xs font-medium text-ink/80">
        Number of days <span className="text-rose-500">*</span>
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="One day less"
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= 1}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#c7cbee] bg-white/70 text-ink transition hover:bg-white disabled:opacity-40"
        >
          <Minus size={16} />
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_BOOKING_DAYS}
          value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
          aria-label="Number of days"
          className="field w-20 text-center text-base font-semibold"
        />
        <button
          type="button"
          aria-label="One day more"
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= MAX_BOOKING_DAYS}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#c7cbee] bg-white/70 text-ink transition hover:bg-white disabled:opacity-40"
        >
          <Plus size={16} />
        </button>
        <span className="text-sm text-muted">{value === 1 ? "day" : "days"}</span>
      </div>
      {msg ? (
        <span className="block text-xs text-rose-600">{msg}</span>
      ) : (
        <span className="block text-xs text-muted">
          {startDate ? nicePeriod(startDate, value) : dayCount(value)}
          {price != null && price !== "" ? ` · ${money(price)} × ${dayCount(value)} = ${money(Number(price) * value)}` : ""}
          {` · max ${MAX_BOOKING_DAYS} days, same caregiver every day`}
        </span>
      )}
    </div>
  );
}
