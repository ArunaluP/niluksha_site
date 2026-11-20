import * as z from "zod";

/** Reusable Zod pieces so every module validates the same way. */

export const id = z.coerce.number().int().positive();

/** Optional text: trims, turns "" into undefined, caps length. */
export const optText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(max).optional());

/** Same, but "" / null clears the value (for PATCH): returns null. */
export const nullableText = (max: number) =>
  z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(max).nullable().optional());

export const reqText = (max: number, label = "This field") =>
  z.string({ error: `${label} is required.` }).trim().min(1, { error: `${label} is required.` }).max(max);

/** Sri Lankan phone numbers: digits, spaces, +, - (9–15 chars). */
export const phone = z
  .string()
  .trim()
  .regex(/^[0-9+\-\s]{9,15}$/, { error: "Enter a valid phone number, e.g. 0771234567." });

/** NIC: old (9 digits + V/X) or new (12 digits). */
export const nic = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^(\d{9}[VX]|\d{12})$/, { error: "NIC must be 9 digits + V/X, or 12 digits." });

export const isoDate = z.iso.date({ error: "Use the date format YYYY-MM-DD." });

/** "08:00" or "08:00:00" → "08:00:00" */
export const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, { error: "Use the time format HH:MM (24-hour)." })
  .transform((t) => (t.length === 5 ? `${t}:00` : t));

/** Money like 4500 or "4500.00" → "4500.00" */
export const money = z.coerce
  .number()
  .positive()
  .max(9_999_999)
  .transform((n) => n.toFixed(2));

/** Query-string booleans: "true"/"1" → true, "false"/"0" → false. */
export const queryBool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

/** ?page=1&pageSize=20 */
export const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export function pageParams(q: { page: number; pageSize: number }) {
  return { limit: q.pageSize, offset: (q.page - 1) * q.pageSize };
}

export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };
