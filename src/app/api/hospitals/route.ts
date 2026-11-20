import { createHospital, HospitalCreateSchema, HospitalListQuery, listHospitals } from "@/features/hospitals/service";
import { api, ok, readBody, readQuery } from "@/lib/api";

/** GET /api/hospitals?type=private|government&search=&active= */
export const GET = api({ permission: "viewMasterData" }, async ({ req }) => listHospitals(readQuery(req, HospitalListQuery)));

/** POST /api/hospitals   { name, type, address?, city?, phone? }   (admin) */
export const POST = api({ permission: "manageHospitals" }, async ({ req }) =>
  ok(await createHospital(await readBody(req, HospitalCreateSchema)), 201),
);
