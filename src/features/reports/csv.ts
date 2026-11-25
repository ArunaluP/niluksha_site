import "server-only";
import { toIsoDate } from "@/lib/dates";
import { EVENT_LABELS, statusLabel, stepsLabel } from "./events";
import type { ActivityEvent } from "./service";

const HEADER = [
  "Date", "Time", "Event", "Booking no", "Customer", "Customer phone", "Patient", "Service date", "Start time",
  "Package", "Hours", "Rate", "Branch", "Employee", "Current status", "Done by", "Note", "Steps in period",
];

const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", hour: "2-digit", minute: "2-digit", hour12: false });

/**
 * One CSV field: quoted when it holds a comma, quote or line break (quotes doubled).
 * Text that Excel would run as a formula (= + - @ at the start) gets a leading ' .
 */
function field(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** A field written as-is (already CSV-safe). */
class RawField {
  constructor(readonly text: string) {}
}

/** Phone as ="0771234567" so Excel keeps the leading zero (digits only, so it's safe). */
function phoneField(phone: string | null | undefined): RawField | string | null | undefined {
  return phone && /^\d+$/.test(phone) ? new RawField(`"=""${phone}"""`) : phone;
}

/** CSV text with a UTF-8 BOM, so Excel shows Sinhala / Tamil names correctly. */
export function activityCsv(events: ActivityEvent[]): string {
  const lines = [HEADER.map(field).join(",")];
  for (const e of events) {
    const at = new Date(e.at);
    lines.push(
      [
        toIsoDate(at),
        timeFmt.format(at),
        e.event ? EVENT_LABELS[e.event] : `${e.fromStatus ?? "—"} → ${e.toStatus}`,
        e.bookingNo,
        e.customerName,
        phoneField(e.customerPhone),
        e.patientName,
        e.serviceDate,
        e.startTime?.slice(0, 5),
        e.packageName,
        e.durationHours,
        e.rate,
        e.branchName,
        e.employeeName,
        statusLabel(e.status),
        e.doneBy,
        e.note,
        stepsLabel(e.steps),
      ]
        .map((v) => (v instanceof RawField ? v.text : field(v)))
        .join(","),
    );
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}
