import { ExportRequest, runExport } from "@/features/exports/service";
import { api, readBody } from "@/lib/api";

/**
 * POST /api/exports   { report: "activity"|"employees"|"employee", destination: "download"|"drive"|"both",
 *                       filters: { from, to, branchId?, event? }, empNo? }
 * Builds the Excel file. download/both → `file` (base64 .xlsx); drive/both → uploaded to the
 * connected Google Drive folder (<folder>/<YYYY-MM>/) and `drive.link` returned.
 * Saving to Drive: Director + call center. Every export is logged.
 */
export const POST = api({ permission: "viewReports" }, async ({ req, user }) => runExport(user, await readBody(req, ExportRequest)));
