import "server-only";
import { desc, eq } from "drizzle-orm";
import * as z from "zod";
import { db } from "@/db";
import { branches, EXPORT_DESTINATIONS, EXPORT_REPORTS, exportLogs, users } from "@/db/schema";
import { getDriveStatus, uploadToDrive } from "@/features/drive/service";
import { EmployeeReportQuery, getEmployeeRanking, getEmployeeSessions, listFinishedSessions } from "@/features/reports/employees";
import { activityWorkbook, employeesWorkbook, employeeWorkbook, XLSX_MIME } from "@/features/reports/excel";
import { getActivityReport, ReportQuery } from "@/features/reports/service";
import type { CurrentUser } from "@/lib/dal";
import { describeError, ForbiddenError, ValidationError } from "@/lib/errors";
import { hasPermission } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";

/**
 * Excel export of a report, to the user's computer and/or the company Google Drive.
 * The same filters as the page (period, branch, event / employee) are sent along,
 * so the file holds exactly what the user is looking at — every row, no paging.
 * Every export is written to export_logs (also failed Drive uploads).
 */
export const ExportRequest = z.object({
  report: z.enum(EXPORT_REPORTS),
  destination: z.enum(EXPORT_DESTINATIONS),
  /** The page's filters as they are in its URL (from, to, branchId, event, custom…). */
  filters: z.record(z.string(), z.string()).default({}),
  /** Employee number, for report = "employee". */
  empNo: z.string().trim().max(20).optional(),
});

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();

export async function runExport(user: CurrentUser, input: z.infer<typeof ExportRequest>) {
  const wantsDrive = input.destination !== "download";
  if (wantsDrive && !hasPermission(user, "saveReportsToDrive")) throw new ForbiddenError("Your role can download reports but not save them to Google Drive.");
  if (wantsDrive) {
    const drive = await getDriveStatus();
    if (!drive.ready) throw new ValidationError({ destination: [drive.connected ? "Google Drive isn't ready (folder missing or access removed). Ask the Director to check Settings." : "Google Drive isn't connected yet. Ask the Director to connect it in Settings."] });
  }

  const settings = await getSettings();
  const isDirector = user.role === "admin";
  const company = settings.company_name || "Care Services";

  // Branch label for the file / header.
  const branchIdRaw = isDirector ? input.filters.branchId : undefined;
  const branchName = branchIdRaw
    ? ((await db.select({ name: branches.name }).from(branches).where(eq(branches.id, Number(branchIdRaw))))[0]?.name ?? "Branch")
    : user.role === "branch_manager"
      ? ((await db.select({ name: branches.name }).from(branches).where(eq(branches.id, user.branchId ?? -1)))[0]?.name ?? "Own branch")
      : "All branches";

  let data: Buffer, title: string, from: string, to: string, periodLabel: string, rows: number, subject: string | null = null;

  if (input.report === "activity") {
    const q = parse(ReportQuery, input.filters);
    const r = await getActivityReport(user, q, { all: true });
    title = "Customer report";
    ({ from, to } = q);
    periodLabel = r.period.label;
    rows = r.events.length;
    data = await activityWorkbook({ company, title, period: periodLabel, scope: branchName, by: user.name }, r);
  } else if (input.report === "employees") {
    const q = parse(EmployeeReportQuery, input.filters);
    const [r, sessions] = await Promise.all([getEmployeeRanking(user, q, { all: true }), listFinishedSessions(user, q)]);
    title = "Employee report";
    ({ from, to } = q);
    periodLabel = r.period.label;
    rows = r.items.length;
    data = await employeesWorkbook({ company, title, period: periodLabel, scope: branchName, by: user.name }, r, sessions);
  } else {
    if (!input.empNo) throw new ValidationError({ empNo: ["Which employee?"] });
    const q = parse(EmployeeReportQuery, input.filters);
    const r = await getEmployeeSessions(user, input.empNo, q);
    title = `Employee report - ${r.employee.fullName} (${r.employee.empNo})`;
    ({ from, to } = q);
    periodLabel = r.period.label;
    rows = r.sessions.length;
    subject = r.employee.empNo;
    data = await employeeWorkbook({ company, title, period: periodLabel, scope: branchName, by: user.name }, r);
  }

  const fileName = safeName(`${title} ${from === to ? from : `${from} to ${to}`} - ${branchName}.xlsx`);

  // Upload first (if asked); a failed upload is logged and reported, the download still works for "both".
  let drive: { id: string; link: string } | null = null;
  let driveError: string | null = null;
  if (wantsDrive) {
    try {
      drive = await uploadToDrive({ name: fileName, mimeType: XLSX_MIME, data, month: to.slice(0, 7) });
    } catch (e) {
      driveError = describeError(e).message;
    }
  }

  await db.insert(exportLogs).values({
    userId: user.id,
    report: input.report,
    periodFrom: from,
    periodTo: to,
    branchId: branchIdRaw ? Number(branchIdRaw) : user.role === "branch_manager" ? user.branchId : null,
    subject,
    fileName: fileName.slice(0, 255),
    rowsCount: rows,
    destination: input.destination,
    driveFileId: drive?.id ?? null,
    driveLink: drive?.link ?? null,
    status: driveError ? "failed" : "ok",
    error: driveError?.slice(0, 255) ?? null,
  });

  if (driveError && input.destination === "drive") throw new ValidationError({ destination: [driveError] });

  return {
    fileName,
    mimeType: XLSX_MIME,
    rows,
    /** base64 .xlsx, only when the user asked to download it. */
    file: input.destination === "drive" ? null : data.toString("base64"),
    drive: drive ? { link: drive.link } : null,
    driveError,
  };
}

function parse<S extends z.ZodType>(schema: S, filters: Record<string, string>): z.infer<S> {
  const clean = Object.fromEntries(Object.entries(filters).filter(([k, v]) => v !== "" && !["page", "print", "view"].includes(k)));
  const r = schema.safeParse(clean);
  if (!r.success) throw new ValidationError({ filters: [r.error.issues[0]?.message ?? "Invalid filters."] });
  return r.data;
}

/** Settings → "Recent exports". */
export async function recentExports(limit = 10) {
  return db
    .select({
      id: exportLogs.id,
      report: exportLogs.report,
      fileName: exportLogs.fileName,
      destination: exportLogs.destination,
      driveLink: exportLogs.driveLink,
      status: exportLogs.status,
      error: exportLogs.error,
      rowsCount: exportLogs.rowsCount,
      createdAt: exportLogs.createdAt,
      userName: users.name,
    })
    .from(exportLogs)
    .innerJoin(users, eq(users.id, exportLogs.userId))
    .orderBy(desc(exportLogs.id))
    .limit(limit);
}
