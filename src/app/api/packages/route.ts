import { createPackage, listPackages, PackageCreateSchema, PackageListQuery } from "@/features/packages/service";
import { api, ok, readBody, readQuery } from "@/lib/api";

/** GET /api/packages?active=true   (anyone who can book; Director sees all) */
export const GET = api({ permission: "viewPackages" }, async ({ req }) => listPackages(readQuery(req, PackageListQuery)));

/** POST /api/packages   { name, durationHours (1–24), price, description?, isDefault? }   (Director) */
export const POST = api({ permission: "managePackages" }, async ({ req }) =>
  ok(await createPackage(await readBody(req, PackageCreateSchema)), 201),
);
