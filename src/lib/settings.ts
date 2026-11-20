import "server-only";
import { db } from "@/db";
import { settings } from "@/db/schema";

/** All settings as a key → value map (small table, read whole). */
export async function getSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(settings);
  return Object.fromEntries(rows.map((r) => [r.settingKey, r.value]));
}

/** Current price of one 24-hour session, e.g. "4500.00". Copied onto each booking. */
export async function getSessionRate(): Promise<string> {
  const all = await getSettings();
  return all.session_rate ?? "4500.00";
}
