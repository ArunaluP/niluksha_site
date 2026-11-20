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

export function currentYear(): number {
  return Number(today().slice(0, 4));
}
