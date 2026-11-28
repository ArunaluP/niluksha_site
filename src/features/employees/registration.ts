/**
 * Employee registration form (translated from the company's Sinhala paper form).
 * Plain constants only: used by the database schema, the server and the browser.
 */

/** "How did you hear about us?" — one choice. */
export const HEARD_FROM = ["poster", "leaflet", "newspaper", "facebook", "messenger", "office", "employee"] as const;
export type HeardFrom = (typeof HEARD_FROM)[number];

export const HEARD_FROM_LABELS: Record<HeardFrom, string> = {
  poster: "Poster",
  leaflet: "Leaflet",
  newspaper: "Newspaper",
  facebook: "Facebook",
  messenger: "Messenger",
  office: "Office",
  employee: "Employee (referral)",
};

/** The 25 districts of Sri Lanka. */
export const DISTRICTS = [
  "Ampara", "Anuradhapura", "Badulla", "Batticaloa", "Colombo", "Galle", "Gampaha", "Hambantota", "Jaffna", "Kalutara", "Kandy", "Kegalle", "Kilinochchi",
  "Kurunegala", "Mannar", "Matale", "Matara", "Monaragala", "Mullaitivu", "Nuwara Eliya", "Polonnaruwa", "Puttalam", "Ratnapura", "Trincomalee", "Vavuniya",
] as const;

/** Documents handed over at registration (ticked = received). */
export const DOCUMENTS = [
  { key: "docGnCertificate", label: "Grama Niladhari certificate" },
  { key: "docNicCopy", label: "NIC copy" },
  { key: "docPoliceCertificate", label: "Police certificate" },
  { key: "docCharacterCertificate", label: "Character certificate" },
  { key: "docBirthCertificate", label: "Birth certificate" },
] as const;
export type DocumentKey = (typeof DOCUMENTS)[number]["key"];

/** Rules on the form ("Rules & agreement"). */
export const RULES = [
  "If caught intoxicated — fine Rs. 5,000.",
  "Looking after two patients without permission — fine Rs. 3,000.",
  "If caught stealing — referred to the relevant authorities for legal action.",
  "Using other people's belongings is prohibited.",
  "Causing disputes in the boarding house — fine Rs. 1,000.",
  "When leaving the company, the employee must come to the head office and hand in a resignation.",
] as const;

/** The declaration the employee signs, with the company name from Settings. */
export function declarationText(company: string) {
  const name = company.trim() || "the company";
  return (
    `I, the above-named, join ${name} from the date above and agree to the rules above. ` +
    "I will not work dishonestly, or against the company's rules, with the patients the company assigns to me. " +
    "If I am found doing so, I agree to pay back to the company the money paid to me from my first day of work to my last day, " +
    "and I give my consent to any legal action needed for this."
  );
}

/** Webcam photo: square, this many pixels. Small JPEG (≈ 30–80 KB). */
export const PHOTO_SIZE = 480;
/** Largest photo the server accepts (decoded bytes). */
export const PHOTO_MAX_BYTES = 600 * 1024;

/* ---------------------------------------------------------------------------
 * Sinhala versions — the wording of the company's paper form, for the Sinhala print.
 * ------------------------------------------------------------------------- */

export const HEARD_FROM_LABELS_SI: Record<HeardFrom, string> = {
  poster: "පෝස්ටර්",
  leaflet: "ලීෆ්ලට්",
  newspaper: "පත්තර",
  facebook: "ෆේස්බුක්",
  messenger: "මැසෙන්ජර්",
  office: "ඔෆිස්",
  employee: "සේවක",
};

export const DOCUMENT_LABELS_SI: Record<DocumentKey, string> = {
  docGnCertificate: "ග්‍රාම නිලධාරී සහතිකය",
  docNicCopy: "හැඳුනුම්පත් පිටපත",
  docPoliceCertificate: "පොලිස් සහතිකය",
  docCharacterCertificate: "චරිත සහතිකය",
  docBirthCertificate: "උප්පැන්න සහතිකය",
};

export const RULES_SI = [
  "බීමත්ව අසුවුවහොත් දඩ මුදල රුපියල් 5000.",
  "අවසර නොමැතිව රෝගීන් දෙදෙනෙකු බැලීම දඩ මුදල රුපියල් 3000.",
  "සොරකම් කිරීමට අසුවුවහොත් නීතිමය කටයුතු සඳහා අදාළ අංශ වලට යොමු කිරීම.",
  "අන් අයගේ බඩු භාණ්ඩ පාවිච්චිය තහනම්.",
  "බෝඩිම තුළ ආරවුල් ඇති කිරීම දඩ මුදල රුපියල් 1000.",
  "ආයතනයෙන් ඉවත් වීමේදී ප්‍රධාන කාර්යාලයට පැමිණ අස්වීම භාරදිය යුතුයි.",
] as const;

/** The Sinhala declaration, with the Sinhala company name from Settings (or the English one). */
export function declarationTextSi(company: string) {
  const name = company.trim();
  const joins = name ? `${name} ආයතනයට` : "ආයතනයට";
  return (
    `ඉහත නම සඳහන් මා අද දින සිට ${joins} බැඳී රාජකාරී කටයුතු සිදු කරන අතර, ඉහත සඳහන් නීතිරීති සඳහා මා එකඟ වන බවත්, ` +
    "ආයතනයෙන් මා වෙත ලබා දෙන රෝගීන් වෙත ආයතනික නීතිරීති වලට පටහැනිව හෝ වංචනිකව සේවය නොකරන බවත්, " +
    "එසේ සේවය කරන බවට අසුවුවහොත් සේවය ආරම්භක දින සිට අවසන් දින දක්වා ගෙවූ මුදල් ආයතනයට ආපසු ගෙවීමට එකඟ වන බවත්, " +
    "ඒ සඳහා අවශ්‍ය නීතිමය ක්‍රියාමාර්ග ගැනීමට මාගේ එකඟත්වය ලබා දෙන බවත් මෙයින් සහතික කරමි."
  );
}
