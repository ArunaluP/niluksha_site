import { getHospital, HospitalUpdateSchema, updateHospital } from "@/features/hospitals/service";
import { api, readBody, toId } from "@/lib/api";

/** GET /api/hospitals/:id */
export const GET = api<{ id: string }>({ permission: "viewMasterData" }, async ({ params }) => getHospital(toId(params.id, "Hospital")));

/** PATCH /api/hospitals/:id   (admin) */
export const PATCH = api<{ id: string }>({ permission: "manageHospitals" }, async ({ req, params }) =>
  updateHospital(toId(params.id, "Hospital"), await readBody(req, HospitalUpdateSchema)),
);
