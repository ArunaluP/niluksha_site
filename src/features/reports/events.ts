/**
 * Report events — the ONE place that says what a status-log row means.
 * Every row in booking_status_logs is one event; it is classified by
 * (from_status → to_status). The service (SQL CASE + filters), the CSV and the
 * page all use EVENT_RULES / classifyEvent, so they can never disagree.
 *
 * The report shows ONE row per booking: its LAST event in the period
 * (the step it reached), with the earlier steps of that period as a trail.
 *
 * Pure module (no server imports): safe to use in server and client code.
 */
import type { BookingStatus } from "@/db/schema";

export const EVENT_KEYS = ["created", "confirmed", "ignored", "assigned", "reassigned", "unassigned", "delivered", "invoice_printed"] as const;
export type EventKey = (typeof EVENT_KEYS)[number];

/** from: a status, null (= no previous status, i.e. a new booking) or "any". */
export type EventRule = { key: EventKey; label: string; short: string; from: BookingStatus | null | "any"; to: BookingStatus };

export const EVENT_RULES: readonly EventRule[] = [
  { key: "created", label: "New booking", short: "New", from: null, to: "pending" },
  { key: "confirmed", label: "Confirmed", short: "Confirmed", from: "pending", to: "confirmed" },
  { key: "ignored", label: "Ignored", short: "Ignored", from: "any", to: "ignored" },
  { key: "assigned", label: "Assigned", short: "Assigned", from: "confirmed", to: "assigned" },
  { key: "reassigned", label: "Reassigned", short: "Reassigned", from: "assigned", to: "assigned" },
  { key: "unassigned", label: "Unassigned", short: "Unassigned", from: "assigned", to: "confirmed" },
  { key: "delivered", label: "Delivered (invoice created)", short: "Delivered", from: "assigned", to: "delivered" },
  { key: "invoice_printed", label: "Invoice printed", short: "Invoice printed", from: "delivered", to: "invoice_printed" },
];

export const EVENT_LABELS = Object.fromEntries(EVENT_RULES.map((r) => [r.key, r.label])) as Record<EventKey, string>;
export const EVENT_SHORT = Object.fromEntries(EVENT_RULES.map((r) => [r.key, r.short])) as Record<EventKey, string>;

/** ["created","confirmed","assigned"] → "New → Confirmed → Assigned" */
export function stepsLabel(steps: (EventKey | null)[]) {
  return steps.map((s) => (s ? EVENT_SHORT[s] : "?")).join(" → ");
}

/** (from → to) → event key, or null for a combination the life cycle never produces. */
export function classifyEvent(from: BookingStatus | null, to: BookingStatus): EventKey | null {
  const rule = EVENT_RULES.find((r) => r.to === to && (r.from === "any" || r.from === from));
  return rule?.key ?? null;
}

/**
 * The keys an ?event= filter matches. "assigned" includes reassignments,
 * so the list always matches the Assigned card (which counts both).
 */
export function eventFilterKeys(event: EventKey): EventKey[] {
  return event === "assigned" ? ["assigned", "reassigned"] : [event];
}

/** Current booking status → readable label (CSV; the page uses StatusBadge). */
export function statusLabel(status: string) {
  const s = status.replaceAll("_", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ------------------------------------------------------------------ periods
const fmtDay = (iso: string, withYear: boolean) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
};

/** "24 Nov 2026", "1 Nov – 24 Nov 2026", "28 Dec 2025 – 3 Jan 2026" */
export function periodLabel(from: string, to: string) {
  if (from === to) return fmtDay(from, true);
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${fmtDay(from, !sameYear)} – ${fmtDay(to, true)}`;
}

/** Whole days from a to b ('YYYY-MM-DD'), e.g. same day = 0. */
export function daysBetween(a: string, b: string) {
  const t = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((t(b) - t(a)) / 86_400_000);
}
