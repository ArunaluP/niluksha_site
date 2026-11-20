import { EmployeeUpdateSchema, getEmployeeDetail, updateEmployee } from "@/features/employees/service";
import { api, readBody, toId } from "@/lib/api";

/** GET /api/employees/:id   (includes leave records) */
export const GET = api<{ id: string }>({ permission: "viewMasterData" }, async ({ params, user }) =>
  getEmployeeDetail(toId(params.id, "Employee"), user),
);

/** PATCH /api/employees/:id   (any field, plus status: active|inactive) */
export const PATCH = api<{ id: string }>({ permission: "manageEmployees" }, async ({ req, params, user }) =>
  updateEmployee(toId(params.id, "Employee"), await readBody(req, EmployeeUpdateSchema), user),
);
