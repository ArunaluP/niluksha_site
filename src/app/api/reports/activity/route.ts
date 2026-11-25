import { getActivityReport, ReportQuery } from "@/features/reports/service";
import { api, readQuery } from "@/lib/api";

/**
 * GET /api/reports/activity?from=&to=&event=&branchId=&page=&pageSize=
 * Every booking event (status change) in the period + counts, money and breakdowns.
 * Defaults to today. Branch managers see only their branch; branchId is Director only.
 */
export const GET = api({ permission: "viewReports" }, async ({ req, user }) => getActivityReport(user, readQuery(req, ReportQuery)));
