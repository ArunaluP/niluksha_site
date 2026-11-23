import { getPackage, PackageUpdateSchema, updatePackage } from "@/features/packages/service";
import { api, readBody, toId } from "@/lib/api";

/** GET /api/packages/:id */
export const GET = api<{ id: string }>({ permission: "viewPackages" }, async ({ params }) => getPackage(toId(params.id, "Package")));

/** PATCH /api/packages/:id   { name?, durationHours?, price?, description?, isDefault?, isActive? }   (Director) */
export const PATCH = api<{ id: string }>({ permission: "managePackages" }, async ({ req, params }) =>
  updatePackage(toId(params.id, "Package"), await readBody(req, PackageUpdateSchema)),
);
