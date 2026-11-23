/**
 * Sri Lankan field rules (names, phone numbers, NIC, city, address).
 * Pure functions with no server imports, so the same rules run in the
 * browser (instant feedback) and on the server (Zod schemas in validation.ts).
 */

// ------------------------------------------------------------------ phones
/** Mobile operators: 070 071 072 074 075 076 077 078 */
const MOBILE = /^07[0-24-8]\d{7}$/;
/** Landlines: 0 + area code + 7 digits (011 Colombo, 033 Gampaha, 081 Kandy …) */
const LANDLINE = /^0(11|2[1-7]|3[1-8]|4[157]|5[1-57]|6[3-7]|81|9[1])\d{7}$/;

/**
 * "+94 77 123 4567", "0094771234567", "94771234567", "077-123-4567"
 * → "0771234567". Returns null when it isn't a valid Sri Lankan number.
 */
export function normalizePhone(raw: string): string | null {
  let d = raw.trim().replace(/[\s\-().]/g, "");
  if (!/^\+?\d+$/.test(d)) return null;
  d = d.replace(/^\+/, "");
  if (d.startsWith("0094")) d = "0" + d.slice(4);
  else if (d.startsWith("94") && d.length === 11) d = "0" + d.slice(2);
  else if (d.length === 9 && !d.startsWith("0")) d = "0" + d; // 771234567
  return MOBILE.test(d) || LANDLINE.test(d) ? d : null;
}

export const PHONE_ERROR = "Enter a valid Sri Lankan number, e.g. 0771234567 or 0112345678.";

// ------------------------------------------------------------------ email
export const EMAIL_MAX = 160;
/**
 * name@domain.tld — letters, digits and . _ % + - before the @; a domain made of
 * labels (letters, digits, hyphens, not starting/ending with a hyphen) and a
 * 2+ letter ending (.lk, .com, .co.uk). No spaces, no ".." anywhere.
 */
const EMAIL = /^[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

/** Trimmed and lower-cased; the form it is stored in. */
export const normalizeEmail = (raw: string) => raw.trim().toLowerCase();

export function checkEmail(raw: string): string | null {
  const v = normalizeEmail(raw);
  if (v.length > EMAIL_MAX) return `Email must be ${EMAIL_MAX} characters or fewer.`;
  if (!EMAIL.test(v) || v.includes("..") || v.startsWith(".") || v.includes(".@")) return "Enter a valid email address, e.g. name@example.com.";
  return null;
}

// ------------------------------------------------------------------ NIC
export type NicInfo = {
  nic: string;
  gender: "male" | "female";
  dob: string;
  format: "old" | "new";
};

/** NIC days use a 366-day calendar: February always has 29 days. */
const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Old NIC: YY DDD SSS C + V/X   (e.g. 853400937V)
 * New NIC: YYYY DDD SSSS C      (e.g. 198534000937)
 * DDD = day of the year of birth, +500 for women.
 * Returns the decoded details, or a human-readable error.
 */
export function parseNic(raw: string): NicInfo | { error: string } {
  const nic = raw.trim().toUpperCase().replace(/\s/g, "");
  let year: number;
  let day: number;
  let format: "old" | "new";

  if (/^\d{9}[VX]$/.test(nic)) {
    year = 1900 + Number(nic.slice(0, 2));
    day = Number(nic.slice(2, 5));
    format = "old";
  } else if (/^\d{12}$/.test(nic)) {
    year = Number(nic.slice(0, 4));
    day = Number(nic.slice(4, 7));
    format = "new";
  } else {
    return { error: "NIC must be 9 digits + V/X (old) or 12 digits (new)." };
  }

  const gender = day > 500 ? "female" : "male";
  if (day > 500) day -= 500;
  if (day < 1 || day > 366)
    return {
      error: "Invalid NIC: the birth-day digits don't match a real date.",
    };

  let m = 0;
  let d = day;
  while (d > MONTH_DAYS[m]) d -= MONTH_DAYS[m++];

  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  if (m === 1 && d === 29 && !leap) return { error: "Invalid NIC: 29 February doesn't exist in that birth year." };

  const thisYear = new Date().getFullYear();
  if (year < 1900 || year > thisYear - 16)
    return {
      error: "NIC birth year is not valid (holder must be 16 or older).",
    };

  const dob = `${year}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { nic, gender, dob, format };
}

/** "1985-12-05" → "5 Dec 1985" (no Intl differences between server and browser). */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const prettyDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/**
 * When a valid NIC is given, the date of birth (and gender, if the form has one)
 * must agree with it. Returns field errors; empty when everything matches.
 */
export function nicConflicts(f: { nic?: string | null; dob?: string | null; gender?: string | null }) {
  const e: Partial<Record<"dob" | "gender", string>> = {};
  if (!f.nic) return e;
  const n = parseNic(f.nic);
  if ("error" in n) return e; // the NIC itself is reported elsewhere
  if (f.dob && f.dob.slice(0, 10) !== n.dob) e.dob = `Date of birth doesn't match the NIC (NIC says ${prettyDate(n.dob)}).`;
  if (f.gender && f.gender !== n.gender) e.gender = `Gender doesn't match the NIC (NIC says ${n.gender === "male" ? "man" : "woman"}).`;
  return e;
}

/** Date of birth on its own: a real past date, not before 1900. */
export function checkDob(iso: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "Use a valid date.";
  const today = new Date().toISOString().slice(0, 10);
  if (iso > today) return "Date of birth can't be in the future.";
  if (iso < "1900-01-01") return "Date of birth is too far in the past.";
  return null;
}

// ------------------------------------------------------------------ names & places
/** Letters in any script (English, Sinhala, Tamil), spaces, . ' - */
const NAME = /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u;
/** Letters, numbers and normal address punctuation: , . / - # ' ( ) : */
const ADDRESS = /^[\p{L}\p{M}\d\s,./#'():-]+$/u;

/** Trims and collapses repeated spaces. */
export const tidy = (s: string) => s.trim().replace(/\s+/g, " ");

export function checkName(raw: string, label = "Name"): string | null {
  const v = tidy(raw);
  if (!v) return `${label} is required.`;
  if (v.replace(/[^\p{L}]/gu, "").length < 2) return `${label} must have at least 2 letters.`;
  if (v.length > 150) return `${label} must be 150 characters or fewer.`;
  if (!NAME.test(v)) return `${label} can only contain letters, spaces, dots, hyphens and apostrophes.`;
  return null;
}

/**
 * One part of a name (first / middle / last). Letters in any script, spaces,
 * dots (for initials like "W. A."), hyphens and apostrophes.
 */
export function checkNamePart(raw: string, label: string, max: number): string | null {
  const v = tidy(raw);
  if (!v) return `${label} is required.`;
  if (!/\p{L}/u.test(v)) return `${label} must contain letters.`;
  if (v.length > max) return `${label} must be ${max} characters or fewer.`;
  if (!NAME.test(v)) return `${label} can only contain letters, spaces, dots, hyphens and apostrophes.`;
  return null;
}

export const NAME_LIMITS = { firstName: 60, middleName: 80, lastName: 60 } as const;

/** Checks first (required), middle (optional) and last (required) name. */
export function checkNameParts(f: { firstName: string; middleName: string; lastName: string }) {
  const e: Partial<Record<"firstName" | "middleName" | "lastName", string>> = {};
  const first = checkNamePart(f.firstName, "First name", NAME_LIMITS.firstName);
  if (first) e.firstName = first;
  if (f.middleName.trim()) {
    const mid = checkNamePart(f.middleName, "Middle name", NAME_LIMITS.middleName);
    if (mid) e.middleName = mid;
  }
  const last = checkNamePart(f.lastName, "Last name", NAME_LIMITS.lastName);
  if (last) e.lastName = last;
  return e;
}

export function checkCity(raw: string): string | null {
  const v = tidy(raw);
  if (v.length < 2) return "City must have at least 2 letters.";
  if (v.length > 80) return "City must be 80 characters or fewer.";
  if (!NAME.test(v)) return "City can only contain letters, spaces, dots and hyphens.";
  return null;
}

export function checkAddress(raw: string): string | null {
  const v = tidy(raw);
  if (v.length < 5) return "Address is too short. Include house no, street and town.";
  if (v.length > 255) return "Address must be 255 characters or fewer.";
  if (!/\p{L}/u.test(v)) return "Address must contain a street or town name.";
  if (!ADDRESS.test(v)) return "Address contains characters that aren't allowed.";
  return null;
}

// ------------------------------------------------------------------ whole customer form
export type CustomerFields = {
  firstName: string;
  middleName: string;
  lastName: string;
  phone: string;
  altPhone: string;
  email: string;
  nic: string;
  dob: string;
  city: string;
  address: string;
};

/** Same rules the server applies; used for instant feedback in the browser. */
export function checkCustomer(f: CustomerFields): Partial<Record<keyof CustomerFields, string>> {
  const e: Partial<Record<keyof CustomerFields, string>> = { ...checkNameParts(f) };

  const phone = f.phone.trim() ? normalizePhone(f.phone) : null;
  if (!f.phone.trim()) e.phone = "Phone number is required.";
  else if (!phone) e.phone = PHONE_ERROR;

  if (f.altPhone.trim()) {
    const alt = normalizePhone(f.altPhone);
    if (!alt) e.altPhone = PHONE_ERROR;
    else if (alt === phone) e.altPhone = "Other phone must be different from the main number.";
  }

  if (f.email.trim()) {
    const m = checkEmail(f.email);
    if (m) e.email = m;
  }
  if (f.nic.trim()) {
    const n = parseNic(f.nic);
    if ("error" in n) e.nic = n.error;
  }
  if (f.dob) {
    const d = checkDob(f.dob) ?? nicConflicts({ nic: f.nic.trim() || null, dob: f.dob }).dob;
    if (d) e.dob = d;
  }
  if (f.city.trim()) {
    const c = checkCity(f.city);
    if (c) e.city = c;
  }
  if (f.address.trim()) {
    const a = checkAddress(f.address);
    if (a) e.address = a;
  }
  return e;
}

// ------------------------------------------------------------------ patient = customer
/**
 * Values to copy into a patient form when the relationship is "Customer themself":
 * the customer's names, date of birth, and gender (worked out from the NIC, since
 * customers don't have a gender field). Only fields the customer actually has.
 */
export function selfPatientValues(c: { firstName: string; middleName: string | null; lastName: string; nic: string | null; dob: string | null }) {
  const v: { firstName: string; middleName: string; lastName: string; dob?: string; gender?: "male" | "female" } = {
    firstName: c.firstName,
    middleName: c.middleName ?? "",
    lastName: c.lastName,
  };
  const n = c.nic ? parseNic(c.nic) : null;
  if (n && !("error" in n)) v.gender = n.gender;
  const dob = c.dob ?? (n && !("error" in n) ? n.dob : null);
  if (dob) v.dob = dob.slice(0, 10);
  return v;
}

// ------------------------------------------------------------------ relationship
export const RELATIONSHIP_OTHER_MAX = 60;

/** The real relationship typed when "Other" is chosen: letters, spaces, . ' - (e.g. "Grandmother"). */
export function checkRelationshipOther(raw: string): string | null {
  const v = tidy(raw);
  if (!v) return "Please type the relationship (e.g. Grandmother, Neighbour).";
  if (v.length > RELATIONSHIP_OTHER_MAX) return `Relationship must be ${RELATIONSHIP_OTHER_MAX} characters or fewer.`;
  if (!/\p{L}/u.test(v) || !NAME.test(v)) return "Relationship can only contain letters, spaces, dots, hyphens and apostrophes.";
  return null;
}

/** "self" → "Customer themself", "other" + "Grandmother" → "Grandmother", "parent" → "Parent". */
export function relationshipLabel(rel: string | null | undefined, other?: string | null): string {
  if (!rel) return "—";
  if (rel === "self") return "Customer themself";
  if (rel === "other") return other || "Other";
  return rel.charAt(0).toUpperCase() + rel.slice(1);
}

// ------------------------------------------------------------------ hospital ward / bed
export const WARD_MAX = 60;
export const BED_MAX = 30;
/** Letters and numbers, plus spaces . / # - (e.g. 12, 12A, ICU, B-04, Room 5). */
const WARD_BED = /^[\p{L}\d][\p{L}\d .\/#-]*$/u;

export function checkWardBed(raw: string, label: "Ward no" | "Bed no"): string | null {
  const v = tidy(raw);
  const max = label === "Ward no" ? WARD_MAX : BED_MAX;
  if (!v) return `${label} is required.`;
  if (v.length > max) return `${label} must be ${max} characters or fewer.`;
  if (!WARD_BED.test(v)) return `${label} can only contain letters, numbers, spaces and . / # -`;
  return null;
}

/** "Asiri Central", "5", "12" → "Asiri Central · Ward 5 · Bed 12" ("Ward ICU" stays as typed). */
export function hospitalPlace(hospital: string | null | undefined, ward?: string | null, bed?: string | null, sep = " · ") {
  const tag = (word: string, v: string) => (new RegExp(`^${word}\\b`, "i").test(v) ? v : `${word} ${v}`);
  return [hospital ?? "Hospital", ward && tag("Ward", ward), bed && tag("Bed", bed)].filter(Boolean).join(sep);
}
