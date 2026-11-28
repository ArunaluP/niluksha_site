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
    /** Company name in Sinhala, for the Sinhala registration form ("" clears it → the English name is used). */
    company_name_si: z.string().trim().max(255).optional(),
    company_address: optText(255),
    company_phone: optText(255),
    /** Where customers open invoice links from WhatsApp, e.g. https://care.example.lk ("" clears it). */
    public_base_url: z
      .string()
      .trim()
      .max(200)
      .transform((v) => v.replace(/\/+$/, ""))
      .refine((v) => v === "" || /^https?:\/\/[a-z0-9.-]+(:\d+)?(\/[\w./-]*)?$/i.test(v), {
        message: "Enter the full address people open the system with, e.g. https://care.example.lk",
      })
      .optional(),
  })
  .strict();

export { getSettings };

export async function updateSettings(input: z.infer<typeof SettingsUpdateSchema>, user: CurrentUser) {
  const entries = Object.entries(input).filter(([, v]) => v !== undefined) as [string, string][];
  // "" is allowed only for the public address and the Sinhala name (clears them); the others ignore empty values.
  for (const [settingKey, value] of entries) {
    await db
      .insert(settings)
      .values({ settingKey, value, updatedBy: user.id })
      .onDuplicateKeyUpdate({ set: { value, updatedBy: user.id, updatedAt: sql`CURRENT_TIMESTAMP` } });
  }
  return getSettings();
}
