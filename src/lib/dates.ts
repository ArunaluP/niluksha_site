/**
 * Date helpers fixed to Sri Lanka time (Asia/Colombo), so "today" and
 * "tomorrow" are correct even if the server runs in another time zone.
 */
const TZ = "Asia/Colombo";

/** 'YYYY-MM-DD' for a date in Sri Lanka time. */
export function toIsoDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function today(): string {
  return toIsoDate(new Date());
}

export function tomorrow(): string {
  return addDays(today(), 1);
}

/** Adds days to a 'YYYY-MM-DD' string (calendar math, no time zone issues). */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** A booking can run 1-30 days in a row. */
export const MAX_BOOKING_DAYS = 30;

/** Last day of a booking: start + days - 1. */
export function endDateOf(start: string, days: number): string {
  return addDays(start, Math.max(1, days) - 1);
}

export function currentYear(): number {
  return Number(today().slice(0, 4));
}

/**
 * Start of a Sri Lanka calendar day as a UTC DATETIME string, for comparing with
 * DATETIME columns (stored in UTC). Sri Lanka is UTC+05:30 all year (no DST).
 *   lkDayStartUtc('2026-11-25') -> '2026-11-24 18:30:00'
 */
export function lkDayStartUtc(isoDate: string): string {
  return `${addDays(isoDate, -1)} 18:30:00`;
}

/** A DATETIME value read as text ('YYYY-MM-DD HH:MM:SS', stored in UTC) -> Date. */
export function utcDate(v: string | Date): Date {
  return v instanceof Date ? v : new Date(`${String(v).replace(" ", "T")}Z`);
}
