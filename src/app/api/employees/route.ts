import { createEmployee, EmployeeCreateSchema, EmployeeListQuery, listEmployees } from "@/features/employees/service";
import { api, ok, readBody, readQuery } from "@/lib/api";

/** GET /api/employees?branchId=&status=active|inactive&search=&page=&pageSize=   (branch managers: own branch) */
export const GET = api({ permission: "viewMasterData" }, async ({ req, user }) =>
  listEmployees(readQuery(req, EmployeeListQuery), user),
);

/**
 * POST /api/employees   { branchId, firstName, lastName, gender, phone, nic?, dob?, address?, designation?, qualifications?, joinDate?,
 *   fileNo?, gnDivision?, district?, nearestPolice?, nearestPostOffice?, guardianName?, guardianRelationship?, guardianAddress?, guardianPhone?,
 *   docGnCertificate?, docNicCopy?, docPoliceCertificate?, docCharacterCertificate?, docBirthCertificate?, heardFrom?, referredBy?, rulesAgreed?,
 *   photo? (data:image/jpeg;base64,...) }
 */
export const POST = api({ permission: "manageEmployees" }, async ({ req, user }) =>
  ok(await createEmployee(await readBody(req, EmployeeCreateSchema), user), 201),
);
