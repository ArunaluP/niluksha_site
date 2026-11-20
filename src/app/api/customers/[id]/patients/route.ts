import { addPatient, PatientCreateSchema } from "@/features/customers/service";
import { api, ok, readBody, toId } from "@/lib/api";

/** POST /api/customers/:id/patients   { fullName, gender, relationship?, dob?, address?, careNotes? } */
export const POST = api<{ id: string }>({ permission: "manageCustomers" }, async ({ req, params }) =>
  ok(await addPatient(toId(params.id, "Customer"), await readBody(req, PatientCreateSchema)), 201),
);
