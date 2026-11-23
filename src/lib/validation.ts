import * as z from "zod";
import { checkAddress, checkDob, checkWardBed, checkEmail, normalizeEmail, checkRelationshipOther, checkCity, checkName, checkNamePart, NAME_LIMITS, normalizePhone, parseNic, PHONE_ERROR, tidy } from "./lk-rules";

/** Reusable Zod pieces so every module validates the same way. */

export const id = z.coerce.number().int().positive();

/** Optional text: trims, turns "" into undefined, caps length. */
export const optText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(max).optional());

/** Same, but "" / null clears the value (for PATCH): returns null. */
export const nullableText = (max: number) => z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(max).nullable().optional());

export const reqText = (max: number, label = "This field") =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, { error: `${label} is required.` })
    .max(max);

/** Sri Lankan phone: mobile (07X) or landline (0XX), stored as 0XXXXXXXXX. Accepts +94 / spaces / dashes. */
export const phone = z
  .string({ error: "Phone number is required." })
  .trim()
  .min(1, { error: "Phone number is required." })
  .transform((v, ctx) => {
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: PHONE_ERROR });
      return z.NEVER;
    }
    return n;
  });

/** Sri Lankan NIC (old 9 digits + V/X, or new 12 digits) with birth-day/year checks. Stored upper-case. */
export const nic = z.string().transform((v, ctx) => {
  const r = parseNic(v);
  if ("error" in r) {
    ctx.addIssue({ code: "custom", message: r.error });
    return z.NEVER;
  }
  return r.nic;
});

/** Builds a Zod string from one of the lk-rules checkers (tidies spaces first). */
const ruled = (check: (v: string) => string | null) =>
  z.string().transform((v, ctx) => {
    const msg = check(v);
    if (msg) {
      ctx.addIssue({ code: "custom", message: msg });
      return z.NEVER;
    }
    return tidy(v);
  });

/** Person's name: letters (any script), spaces, . ' -; at least 2 letters. */
export const personName = (label = "Name") => ruled((v) => checkName(v, label));

/** First / middle / last name for create: first & last required, middle optional. */
const namePart = (label: string, max: number) => ruled((v) => checkNamePart(v, label, max));

/** First / middle / last name (create). full_name is built by MySQL from these. */
export const nameFields = {
  firstName: namePart("First name", NAME_LIMITS.firstName),
  middleName: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), namePart("Middle name", NAME_LIMITS.middleName).optional()),
  lastName: namePart("Last name", NAME_LIMITS.lastName),
};

/** Same for updates: every part optional; an empty middle name clears it. */
export const nameFieldsUpdate = {
  firstName: namePart("First name", NAME_LIMITS.firstName).optional(),
  middleName: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), namePart("Middle name", NAME_LIMITS.middleName).nullable().optional()),
  lastName: namePart("Last name", NAME_LIMITS.lastName).optional(),
};

/** "" → undefined (create) so optional fields can be left empty. */
const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
/** "" → null (update) so a cleared field is removed. */
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const optCity = z.preprocess(emptyToUndef, ruled(checkCity).optional());
export const nullableCity = z.preprocess(emptyToNull, ruled(checkCity).nullable().optional());
export const optAddress = z.preprocess(emptyToUndef, ruled(checkAddress).optional());
export const nullableAddress = z.preprocess(emptyToNull, ruled(checkAddress).nullable().optional());
export const optPhone = z.preprocess(emptyToUndef, phone.optional());
export const nullablePhone = z.preprocess(emptyToNull, phone.nullable().optional());
export const optNic = z.preprocess(emptyToUndef, nic.optional());
export const nullableNic = z.preprocess(emptyToNull, nic.nullable().optional());

export const isoDate = z.iso.date({ error: "Use the date format YYYY-MM-DD." });

/** Date of birth: real date, not in the future, not before 1900. */
export const birthDate = isoDate.refine((v) => !checkDob(v), { error: (iss) => checkDob(String(iss.input)) ?? "Invalid date of birth." });
export const optBirthDate = z.preprocess((v) => (v === "" ? undefined : v), birthDate.optional());
export const nullableBirthDate = z.preprocess((v) => (v === "" ? null : v), birthDate.nullable().optional());

/** "08:00" or "08:00:00" → "08:00:00" */
export const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    error: "Use the time format HH:MM (24-hour).",
  })
  .transform((t) => (t.length === 5 ? `${t}:00` : t));

/** Money like 4500 or "4500.00" → "4500.00" */
export const money = z.coerce
  .number()
  .positive()
  .max(9_999_999)
  .transform((n) => n.toFixed(2));

/** Query-string booleans: "true"/"1" → true, "false"/"0" → false. */
export const queryBool = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");

/** ?page=1&pageSize=20 */
export const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export function pageParams(q: { page: number; pageSize: number }) {
  return { limit: q.pageSize, offset: (q.page - 1) * q.pageSize };
}

export type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

/** The real relationship when "Other" is chosen; required-ness is checked in the patients service. */
export const optRelationshipOther = z.preprocess(emptyToUndef, ruled(checkRelationshipOther).optional());
export const nullableRelationshipOther = z.preprocess(emptyToNull, ruled(checkRelationshipOther).nullable().optional());

/** Optional email: pattern-checked, stored trimmed and lower-case. */
const email = z.string().transform((v, ctx) => {
  const msg = checkEmail(v);
  if (msg) {
    ctx.addIssue({ code: "custom", message: msg });
    return z.NEVER;
  }
  return normalizeEmail(v);
});
export const optEmail = z.preprocess(emptyToUndef, email.optional());
export const nullableEmail = z.preprocess(emptyToNull, email.nullable().optional());

/** Hospital ward / bed numbers (whether the ward is required is checked in the bookings service). */
export const optWardNo = z.preprocess(emptyToUndef, ruled((v) => checkWardBed(v, "Ward no")).optional());
export const nullableWardNo = z.preprocess(emptyToNull, ruled((v) => checkWardBed(v, "Ward no")).nullable().optional());
export const optBedNo = z.preprocess(emptyToUndef, ruled((v) => checkWardBed(v, "Bed no")).optional());
export const nullableBedNo = z.preprocess(emptyToNull, ruled((v) => checkWardBed(v, "Bed no")).nullable().optional());
