import { AvailableQuery, listAvailableEmployees } from "@/features/employees/service";
import { api, readQuery } from "@/lib/api";

/** GET /api/employees/available?date=YYYY-MM-DD&branchId=   free employees (all branches) */
export const GET = api({ permission: "assignEmployee" }, async ({ req }) => {
  const q = readQuery(req, AvailableQuery);
  return listAvailableEmployees(q.date, q.branchId);
});
