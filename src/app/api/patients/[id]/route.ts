import { getPatient, PatientUpdateSchema, updatePatient } from "@/features/customers/service";
import { api, readBody, toId } from "@/lib/api";

/** GET /api/patients/:id */
export const GET = api<{ id: string }>({ permission: "manageCustomers" }, async ({ params }) => getPatient(toId(params.id, "Patient")));

/** PATCH /api/patients/:id */
export const PATCH = api<{ id: string }>({ permission: "manageCustomers" }, async ({ req, params }) =>
  updatePatient(toId(params.id, "Patient"), await readBody(req, PatientUpdateSchema)),
);
