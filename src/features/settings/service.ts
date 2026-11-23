import "server-only";
import { sql } from "drizzle-orm";
import * as z from "zod";
import { db } from "@/db";
import { settings } from "@/db/schema";
import type { CurrentUser } from "@/lib/dal";
import { getSettings } from "@/lib/settings";
import { optText } from "@/lib/validation";

/** Only these keys can be changed through the API. (Prices live in Packages.) */
export const SettingsUpdateSchema = z
  .object({
    company_name: optText(255),
    company_address: optText(255),
    company_phone: optText(255),
  })
  .strict();

export { getSettings };

export async function updateSettings(input: z.infer<typeof SettingsUpdateSchema>, user: CurrentUser) {
  const entries = Object.entries(input).filter(([, v]) => v !== undefined) as [string, string][];
  for (const [settingKey, value] of entries) {
    await db
      .insert(settings)
      .values({ settingKey, value, updatedBy: user.id })
      .onDuplicateKeyUpdate({ set: { value, updatedBy: user.id, updatedAt: sql`CURRENT_TIMESTAMP` } });
  }
  return getSettings();
}
