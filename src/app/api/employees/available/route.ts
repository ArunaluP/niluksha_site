import { AvailableQuery, listAvailableEmployees } from "@/features/employees/service";
import { api, readQuery } from "@/lib/api";
import { assignableBranch } from "@/lib/permissions";

/** GET /api/employees/available?date=YYYY-MM-DD&branchId=   free employees (branch managers: own branch only) */
export const GET = api({ permission: "assignEmployee" }, async ({ req, user }) => {
  const q = readQuery(req, AvailableQuery);
  return listAvailableEmployees(q.date, assignableBranch(user) ?? q.branchId);
});
