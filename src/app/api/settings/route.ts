import { getSettings, SettingsUpdateSchema, updateSettings } from "@/features/settings/service";
import { api, readBody } from "@/lib/api";

/** GET /api/settings */
export const GET = api({ permission: "viewMasterData" }, async () => getSettings());

/** PATCH /api/settings   { company_name?, company_name_si?, company_address?, company_phone?, public_base_url? }   (admin) */
export const PATCH = api({ permission: "manageSettings" }, async ({ req, user }) =>
  updateSettings(await readBody(req, SettingsUpdateSchema), user),
);
