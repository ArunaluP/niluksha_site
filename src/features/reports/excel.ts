import "server-only";
import ExcelJS from "exceljs";
import { hospitalPlace } from "@/lib/lk-rules";
import { EVENT_LABELS, statusLabel, stepsLabel } from "./events";
import type { EmployeeRanking, EmployeeSessions, listFinishedSessions } from "./employees";
import type { ActivityReport } from "./service";

/**
 * Real .xlsx files (ExcelJS) for the report exports.
 * Every sheet: a small header (company, report, period, branch, who/when),
 * then a formatted table with a filter row, frozen header and number formats.
 */

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type Meta = { company: string; title: string; period: string; scope: string; by: string };
type Col = { header: string; key: string; width: number; money?: boolean; num?: boolean; date?: boolean };
type FinishedSession = Awaited<ReturnType<typeof listFinishedSessions>>[number];

const ACCENT = "FF6658F5";
const HEAD_FILL = "FFECEBFF";
const MONEY = '"Rs." #,##0.00';
const dt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

function newBook(meta: Meta) {
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.by;
  wb.created = new Date();
  wb.title = meta.title;
  return wb;
}

/** Adds a sheet with the header block + a table; returns the sheet. */
function tableSheet(wb: ExcelJS.Workbook, name: string, meta: Meta, cols: Col[], rows: Record<string, unknown>[], totals?: Record<string, unknown>) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 6 }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  ws.columns = cols.map((c) => ({ key: c.key, width: c.width }));

  ws.getCell("A1").value = meta.company;
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: ACCENT } };
  ws.getCell("A2").value = `${meta.title} — ${name}`;
  ws.getCell("A2").font = { bold: true, size: 12 };
  ws.getCell("A3").value = `${meta.period} · ${meta.scope}`;
  ws.getCell("A4").value = `Exported ${dt.format(new Date())} by ${meta.by}`;
  ws.getCell("A4").font = { italic: true, color: { argb: "FF6B6B8D" } };

  const head = ws.getRow(6);
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: "FF1F1D3D" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_FILL } };
    cell.border = { bottom: { style: "thin", color: { argb: ACCENT } } };
    cell.alignment = { vertical: "middle", wrapText: true, horizontal: c.money || c.num ? "right" : "left" };
  });
  head.height = 22;

  for (const r of rows) {
    const row = ws.addRow(cols.map((c) => r[c.key] ?? null));
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      if (c.money) {
        cell.value = r[c.key] === null || r[c.key] === undefined ? null : Number(r[c.key]);
        cell.numFmt = MONEY;
      } else if (c.date && typeof r[c.key] === "string" && r[c.key]) {
        const [y, m, d] = String(r[c.key]).split("-").map(Number);
        cell.value = new Date(Date.UTC(y, m - 1, d));
        cell.numFmt = "dd mmm yyyy";
      }
      cell.alignment = { vertical: "top", wrapText: !c.money && !c.num && !c.date };
    });
  }
  if (rows.length) ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: cols.length } };

  if (totals) {
    const row = ws.addRow(cols.map((c) => totals[c.key] ?? null));
    row.font = { bold: true };
    row.eachCell((cell, i) => {
      cell.border = { top: { style: "thin", color: { argb: ACCENT } } };
      if (cols[i - 1]?.money) cell.numFmt = MONEY;
    });
  }
  return ws;
}

/** A sheet of simple label/value blocks (summary). */
function summarySheet(wb: ExcelJS.Workbook, meta: Meta, blocks: { title: string; rows: [string, string | number, string?][]; moneyCol?: boolean }[]) {
  const ws = wb.addWorksheet("Summary");
  ws.columns = [{ width: 34 }, { width: 18 }, { width: 18 }];
  ws.getCell("A1").value = meta.company;
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: ACCENT } };
  ws.getCell("A2").value = meta.title;
  ws.getCell("A2").font = { bold: true, size: 12 };
  ws.getCell("A3").value = `${meta.period} · ${meta.scope}`;
  ws.getCell("A4").value = `Exported ${dt.format(new Date())} by ${meta.by}`;
  ws.getCell("A4").font = { italic: true, color: { argb: "FF6B6B8D" } };
  let r = 6;
  for (const b of blocks) {
    const t = ws.getCell(`A${r}`);
    t.value = b.title;
    t.font = { bold: true, color: { argb: ACCENT } };
    r++;
    for (const [label, a, bVal] of b.rows) {
      ws.getCell(`A${r}`).value = label;
      const ca = ws.getCell(`B${r}`);
      ca.value = typeof a === "string" && /^-?\d+(\.\d+)?$/.test(a) && b.moneyCol ? Number(a) : a;
      if (b.moneyCol) ca.numFmt = MONEY;
      if (bVal !== undefined) ws.getCell(`C${r}`).value = bVal;
      r++;
    }
    r++;
  }
  return ws;
}

const place = (s: { locationType: string; hospitalName: string | null; wardNo: string | null; bedNo: string | null; serviceAddress: string | null }) =>
  s.locationType === "hospital" ? hospitalPlace(s.hospitalName, s.wardNo, s.bedNo, ", ") : (s.serviceAddress ?? "Home");

const printedText = (d: Date | string | null) => (d ? dt.format(new Date(d)) : "");

// ======================================================================= employee ranking
export async function employeesWorkbook(meta: Meta, r: EmployeeRanking, sessions: FinishedSession[]) {
  const wb = newBook(meta);
  tableSheet(
    wb,
    "Ranking",
    meta,
    [
      { header: "Rank", key: "rank", width: 7, num: true },
      { header: "Emp no", key: "empNo", width: 11 },
      { header: "Employee", key: "fullName", width: 28 },
      { header: "Designation", key: "designation", width: 13 },
      { header: "Branch", key: "branchName", width: 22 },
      { header: "Finished sessions", key: "sessions", width: 11, num: true },
      { header: "Days worked", key: "daysWorked", width: 9, num: true },
      { header: "Hours", key: "hours", width: 9, num: true },
      { header: "Value", key: "value", width: 16, money: true },
      { header: "Last worked", key: "lastWorked", width: 14, date: true },
    ],
    r.items,
    { fullName: "Total", sessions: r.totals.sessions, hours: r.totals.hours, value: r.totals.value },
  );
  tableSheet(wb, "Finished sessions", meta, sessionCols(true), sessions.map(sessionRow), {
    bookingNo: `${sessions.length} bookings`,
    daysInPeriod: sessions.reduce((t, s) => t + s.daysInPeriod, 0),
    value: sessions.reduce((t, s) => t + Number(s.rate) * s.daysInPeriod, 0),
  });
  tableSheet(wb, "Per day", meta, [
    { header: r.chart.unit === "day" ? "Date" : "Week from", key: "from", width: 14, date: true },
    ...(r.chart.unit === "week" ? [{ header: "to", key: "to", width: 14, date: true }] : []),
    { header: "Finished sessions", key: "count", width: 16, num: true },
  ], r.chart.bars);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ======================================================================= one employee
export async function employeeWorkbook(meta: Meta, r: EmployeeSessions) {
  const wb = newBook(meta);
  summarySheet(wb, meta, [
    {
      title: "Employee",
      rows: [
        ["Name", r.employee.fullName],
        ["Emp no", r.employee.empNo],
        ["Designation", r.employee.designation],
        ["Branch", r.employee.branchName],
      ],
    },
    {
      title: "In this period",
      rows: [
        ["Finished sessions", r.totals.sessions],
        ["Days worked", r.totals.daysWorked],
        ["Hours of care", r.totals.hours],
      ],
    },
    { title: "Value", rows: [["Value of finished sessions", r.totals.value]], moneyCol: true },
  ]);
  tableSheet(
    wb,
    "Sessions",
    meta,
    sessionCols(false),
    r.sessions.map((s) => sessionRow({ ...s, empNo: r.employee.empNo, employeeName: r.employee.fullName, designation: r.employee.designation })),
    { bookingNo: `${r.sessions.length} bookings`, daysInPeriod: r.totals.sessions, value: r.totals.value },
  );
  tableSheet(wb, "Per day", meta, [
    { header: r.chart.unit === "day" ? "Date" : "Week from", key: "from", width: 14, date: true },
    ...(r.chart.unit === "week" ? [{ header: "to", key: "to", width: 14, date: true }] : []),
    { header: "Finished sessions", key: "count", width: 16, num: true },
  ], r.chart.bars);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function sessionCols(withEmployee: boolean): Col[] {
  return [
    { header: "First day", key: "serviceDate", width: 12, date: true },
    { header: "Last day", key: "endDate", width: 12, date: true },
    { header: "Days", key: "days", width: 6, num: true },
    { header: "Days in period", key: "daysInPeriod", width: 9, num: true },
    { header: "Start", key: "startTime", width: 7 },
    { header: "Booking no", key: "bookingNo", width: 15 },
    ...(withEmployee
      ? [
          { header: "Emp no", key: "empNo", width: 10 },
          { header: "Employee", key: "employeeName", width: 24 },
        ]
      : []),
    { header: "Branch", key: "branchName", width: 20 },
    { header: "Customer", key: "customerName", width: 24 },
    { header: "Phone", key: "customerPhone", width: 13 },
    { header: "Patient", key: "patientName", width: 24 },
    { header: "Package", key: "packageName", width: 20 },
    { header: "Hours", key: "durationHours", width: 7, num: true },
    { header: "Location", key: "location", width: 34 },
    { header: "Rate per day", key: "rate", width: 14, money: true },
    { header: "Value in period", key: "value", width: 15, money: true },
    { header: "Invoice", key: "invoiceNo", width: 16 },
    { header: "Invoice printed", key: "printed", width: 19 },
  ];
}

function sessionRow(s: Omit<FinishedSession, "empNo" | "employeeName" | "designation"> & { empNo?: string; employeeName?: string; designation?: string }) {
  return {
    ...s,
    startTime: s.startTime?.slice(0, 5),
    location: place(s),
    printed: printedText(s.printedAt),
    serviceDate: String(s.serviceDate).slice(0, 10),
    endDate: String(s.endDate ?? s.serviceDate).slice(0, 10),
    value: Number(s.rate) * s.daysInPeriod,
  };
}

// ======================================================================= customer (activity) report
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", hour: "2-digit", minute: "2-digit", hour12: false });
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit" });

export async function activityWorkbook(meta: Meta, r: ActivityReport) {
  const wb = newBook(meta);
  summarySheet(wb, meta, [
    {
      title: "Bookings by the step they reached",
      rows: [
        ["New bookings", r.counts.created],
        ["Confirmed", r.counts.confirmed],
        ["Ignored", r.counts.ignored],
        ["Assigned (incl. reassigned)", r.counts.assigned + r.counts.reassigned],
        ["Unassigned", r.counts.unassigned],
        ["Delivered", r.counts.delivered],
        ["Invoices printed", r.counts.invoice_printed],
      ],
    },
    {
      title: "Money",
      moneyCol: true,
      rows: [
        ["Delivered value", r.money.delivered.value, `${r.money.delivered.count} sessions`],
        ["Invoices printed value", r.money.invoicesPrinted.value, `${r.money.invoicesPrinted.count} invoices`],
      ],
    },
    { title: "Delivered by branch", moneyCol: true, rows: r.byBranch.map((b) => [b.branchName ?? "—", b.value, `${b.sessions} sessions`] as [string, string, string]) },
    { title: "Delivered by package", moneyCol: true, rows: r.byPackage.map((p) => [`${p.packageName ?? "—"} (${p.durationHours} h)`, p.value, `${p.sessions} sessions`] as [string, string, string]) },
  ]);
  tableSheet(
    wb,
    "Bookings",
    meta,
    [
      { header: "Date", key: "day", width: 12, date: true },
      { header: "Time", key: "time", width: 7 },
      { header: "Last step", key: "event", width: 16 },
      { header: "Booking no", key: "bookingNo", width: 15 },
      { header: "Customer", key: "customerName", width: 24 },
      { header: "Phone", key: "customerPhone", width: 13 },
      { header: "Patient", key: "patientName", width: 24 },
      { header: "Service date", key: "serviceDate", width: 13, date: true },
      { header: "Start", key: "start", width: 7 },
      { header: "Package", key: "packageName", width: 20 },
      { header: "Hours", key: "durationHours", width: 7, num: true },
      { header: "Rate", key: "rate", width: 14, money: true },
      { header: "Branch", key: "branchName", width: 20 },
      { header: "Employee", key: "employeeName", width: 22 },
      { header: "Current status", key: "status", width: 15 },
      { header: "Done by", key: "doneBy", width: 16 },
      { header: "Note", key: "note", width: 24 },
      { header: "Steps in period", key: "steps", width: 40 },
    ],
    r.events.map((e) => ({
      ...e,
      day: dayFmt.format(new Date(e.at)),
      time: timeFmt.format(new Date(e.at)),
      event: e.event ? EVENT_LABELS[e.event] : `${e.fromStatus ?? "—"} → ${e.toStatus}`,
      serviceDate: String(e.serviceDate).slice(0, 10),
      start: e.startTime?.slice(0, 5),
      status: statusLabel(e.status),
      steps: stepsLabel(e.steps),
    })),
  );
  return Buffer.from(await wb.xlsx.writeBuffer());
}
