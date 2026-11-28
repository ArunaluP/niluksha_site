import { EmployeeReportQuery, getEmployeeSessions } from "@/features/reports/employees";
import { api, readQuery } from "@/lib/api";

/** GET /api/reports/employees/EMP-0007?from=&to=&branchId= — one employee's finished sessions + daily chart data. */
export const GET = api<{ empNo: string }>({ permission: "viewReports" }, async ({ req, user, params }) =>
  getEmployeeSessions(user, decodeURIComponent(params.empNo), readQuery(req, EmployeeReportQuery)),
);
