import "server-only";
import { db } from "@/db";
import { settings } from "@/db/schema";

/** All settings as a key → value map (small table, read whole). */
export async function getSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(settings);
  return Object.fromEntries(rows.map((r) => [r.settingKey, r.value]));
}
