import { EmployeeReportQuery, getEmployeeRanking } from "@/features/reports/employees";
import { api, readQuery } from "@/lib/api";

/**
 * GET /api/reports/employees?from=&to=&branchId=&page=&pageSize=
 * Employees ranked by FINISHED sessions (invoice printed) in the period, by service date.
 * Tie → whoever worked most recently. Defaults to this month. Branch managers: own branch only.
 */
export const GET = api({ permission: "viewReports" }, async ({ req, user }) => getEmployeeRanking(user, readQuery(req, EmployeeReportQuery)));
