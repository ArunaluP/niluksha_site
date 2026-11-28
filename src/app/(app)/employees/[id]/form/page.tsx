import { HeartPulse, UserRound } from "lucide-react";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { employeePhotoUrl, niceDate, niceDateTime } from "@/components/ui";
import {
  DOCUMENT_LABELS_SI,
  DOCUMENTS,
  HEARD_FROM,
  HEARD_FROM_LABELS,
  HEARD_FROM_LABELS_SI,
  RULES,
  RULES_SI,
  declarationText,
  declarationTextSi,
} from "@/features/employees/registration";
import { getEmployee } from "@/features/employees/service";
import { requirePermission } from "@/lib/dal";
import { NotFoundError } from "@/lib/errors";
import { getSettings } from "@/lib/settings";
import { FormToolbar } from "./form-toolbar";

export const metadata = { title: "Registration form · Care Booking" };

/** Every printed word, in English and in Sinhala (the wording of the company's paper form). */
const TEXT = {
  en: {
    title: "EMPLOYEE REGISTRATION",
    tel: "Tel",
    heardFrom: "Heard about us from",
    referredBy: "referred by",
    empNo: "Employee number",
    date: "Date",
    fullName: "Full name",
    address: "Address",
    phone: "Phone number",
    nic: "NIC number",
    dob: "Date of birth",
    photo: "Photo",
    gn: "Grama Niladhari division",
    district: "District",
    police: "Nearest police station",
    post: "Nearest post office",
    guardian: "Guardian details",
    name: "Name",
    relationship: "Relationship",
    documents: "Documents received",
    rules: "Rules & agreement",
    recorded: (when: string, by: string | null) => `Agreement recorded in the system ${when}${by ? ` by ${by}` : ""}.`,
    officer: "Recruiting officer",
    signature: "Employee signature",
  },
  si: {
    title: "සේවක ලියාපදිංචි පෝරමය",
    tel: "දුරකථන",
    heardFrom: "අප ගැන දැනගත්තේ",
    referredBy: "හඳුන්වා දුන්නේ",
    empNo: "සේවක අංකය",
    date: "දිනය",
    fullName: "සම්පූර්ණ නම",
    address: "ලිපිනය",
    phone: "දුරකථන අංකය",
    nic: "ජාතික හැඳුනුම්පත් අංකය",
    dob: "උපන් දිනය",
    photo: "ඡායාරූපය",
    gn: "ග්‍රාමසේවා වසම",
    district: "දිස්ත්‍රික්කය",
    police: "ළඟම පොලීසිය",
    post: "ළඟම තැපැල් කාර්යාලය",
    guardian: "භාරකරුගේ විස්තරය",
    name: "නම",
    relationship: "සම්බන්ධතාවය",
    documents: "භාරගන්නා ලද සහතික",
    rules: "නීතිරීති හා එකඟතාවය",
    recorded: (when: string, by: string | null) => `එකඟතාවය පද්ධතියේ සටහන් කළේ ${when}${by ? ` (${by})` : ""}.`,
    officer: "බඳවා ගැනීමේ නිලධාරී",
    signature: "සේවක අත්සන",
  },
};
type FormLang = keyof typeof TEXT;

/** Sinhala text needs a Sinhala font (Windows: Nirmala UI / Iskoola Pota). */
const SINHALA_FONT = { fontFamily: '"Noto Sans Sinhala", "Nirmala UI", "Iskoola Pota", "Sinhala MN", system-ui, sans-serif' };

/** The employee registration form on one A4 page, filled in, ready to sign. ?lang=si → Sinhala. */
export default async function EmployeeFormPage({ params, searchParams }: PageProps<"/employees/[id]/form">) {
  const user = await requirePermission("viewMasterData");
  const id = Number((await params).id);
  const lang: FormLang = (await searchParams).lang === "si" ? "si" : "en";
  const t = TEXT[lang];
  const si = lang === "si";
  if (!Number.isInteger(id) || id <= 0) notFound();
  const e = await getEmployee(id, user).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const s = await getSettings();
  const company = s.company_name ?? "";
  const companySi = s.company_name_si?.trim() || company;
  const photo = employeePhotoUrl(e);

  return (
    <div className="mx-auto max-w-[820px]">
      {/* one A4 page */}
      <style>{"@media print { @page { size: A4; margin: 10mm; } }"}</style>
      <FormToolbar id={e.id} name={e.fullName} lang={lang} />

      <article lang={lang} style={si ? SINHALA_FONT : undefined} className="rounded-md bg-white px-12 py-10 text-[12.5px] text-slate-800 shadow-[0_20px_60px_-25px_rgba(30,27,75,0.35)] print:rounded-none print:px-0 print:py-0 print:text-[11.5px] print:shadow-none">
        {/* Header */}
        <header className="flex items-start justify-between border-b border-slate-200 pb-5 print:pb-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#6658f5] text-white">
              <HeartPulse size={20} />
            </span>
            <div>
              <div className="text-base font-semibold text-slate-900">{(si ? companySi : company) || "Care Services"}</div>
              {s.company_address && <div className="text-slate-500">{s.company_address}</div>}
              {s.company_phone && (
                <div className="text-slate-500">
                  {t.tel}: {s.company_phone}
                </div>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className={si ? "text-lg font-semibold text-slate-900" : "text-lg font-light tracking-[0.18em] text-slate-900"}>{t.title}</div>
          </div>
        </header>

        {/* Heard from */}
        <section className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-slate-100 py-3">
          <span className={label(si)}>{t.heardFrom}</span>
          {HEARD_FROM.map((h) => (
            <Box key={h} on={e.heardFrom === h}>
              {si ? HEARD_FROM_LABELS_SI[h] : HEARD_FROM_LABELS[h].replace(" (referral)", "")}
            </Box>
          ))}
          {e.heardFrom === "employee" && e.referrerName && <span className="text-slate-600">
              — {t.referredBy}: {e.referrerName}
            </span>}
        </section>

        {/* Number + photo */}
        <section className="flex gap-6 pt-5 print:pt-3">
          <div className="flex-1">
            <div className="mb-4 flex items-center gap-3 print:mb-2">
              <span className={label(si)}>{t.empNo}</span>
              <span className="min-w-[140px] rounded-md border border-slate-300 px-3 py-1 text-base font-semibold text-slate-900">{e.fileNo ?? ""}</span>
            </div>
            <Lines>
              <Line label={t.date}>{niceDate(e.joinDate)}</Line>
              <Line label={t.fullName}>{e.fullName}</Line>
              <Line label={t.address}>{e.address}</Line>
              <Line label={t.phone}>{[e.phone, e.altPhone].filter(Boolean).join(" / ")}</Line>
              <Line label={t.nic}>{e.nic}</Line>
              <Line label={t.dob}>{e.dob ? niceDate(e.dob) : ""}</Line>
            </Lines>
          </div>
          <div className="flex h-[150px] w-[130px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-300 bg-slate-50">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- our own photo API
              <img src={photo} alt={e.fullName} className="h-full w-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-1 text-slate-400">
                <UserRound size={36} strokeWidth={1.2} />
                <span className="text-[10px]">{t.photo}</span>
              </div>
            )}
          </div>
        </section>
        <Lines>
          <Line label={t.gn}>{e.gnDivision}</Line>
          <Line label={t.district}>{e.district}</Line>
          <Line label={t.police}>{e.nearestPolice}</Line>
          <Line label={t.post}>{e.nearestPostOffice}</Line>
        </Lines>

        {/* Guardian */}
        <Heading si={si}>{t.guardian}</Heading>
        <Lines>
          <Line label={t.name}>{e.guardianName}</Line>
          <Line label={t.relationship}>{e.guardianRelationship}</Line>
          <Line label={t.address}>{e.guardianAddress}</Line>
          <Line label={t.phone}>{e.guardianPhone}</Line>
        </Lines>

        {/* Documents */}
        <Heading si={si}>{t.documents}</Heading>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3 print:grid-cols-3">
          {DOCUMENTS.map((d) => (
            <Box key={d.key} on={e[d.key]}>
              {si ? DOCUMENT_LABELS_SI[d.key] : d.label}
            </Box>
          ))}
        </div>

        {/* Rules */}
        <Heading si={si}>{t.rules}</Heading>
        <ol className="list-decimal space-y-0.5 pl-5 text-slate-700">
          {(si ? RULES_SI : RULES).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
        <p className="mt-3 leading-relaxed text-slate-700 print:mt-2 print:leading-snug">{si ? declarationTextSi(companySi) : declarationText(company)}</p>
        {e.rulesAgreedAt && (
          <p className="mt-2 text-[11px] text-slate-500">{t.recorded(niceDateTime(e.rulesAgreedAt), e.rulesAgreedByName)}</p>
        )}

        {/* Signatures */}
        <section className="mt-12 grid grid-cols-2 gap-16 print:mt-9 print:break-inside-avoid">
          <Signature label={t.officer} dateLabel={t.date} />
          <Signature label={t.signature} dateLabel={t.date} />
        </section>
      </article>
    </div>
  );
}

/** Small grey section label (no capitals / letter spacing for Sinhala). */
function label(si: boolean) {
  return si ? "text-[11.5px] font-semibold text-slate-500" : "text-[10.5px] font-semibold uppercase tracking-wider text-slate-400";
}

function Heading({ children, si = false }: { children: ReactNode; si?: boolean }) {
  return <h2 className={`mt-5 mb-2 print:mt-3 print:mb-1.5 ${label(si)}`}>{children}</h2>;
}

function Lines({ children }: { children: ReactNode }) {
  return <dl className="space-y-1.5 print:space-y-1">{children}</dl>;
}

/** Label, then the value on a dotted line (like the paper form). */
function Line({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="flex items-end gap-2">
      <dt className="shrink-0 text-slate-500">{label}:</dt>
      <dd className="min-h-[20px] print:min-h-[17px] flex-1 border-b border-dotted border-slate-400 pb-0.5 font-medium text-slate-900">{children || " "}</dd>
    </div>
  );
}

function Box({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-slate-700">
      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border border-slate-500 text-[10px] font-bold leading-none text-slate-900">{on ? "✓" : ""}</span>
      {children}
    </span>
  );
}

function Signature({ label, dateLabel }: { label: string; dateLabel: string }) {
  return (
    <div className="text-center">
      <div className="border-b border-dotted border-slate-500" />
      <div className="mt-1.5 text-slate-600">{label}</div>
      <div className="mt-3 text-left text-slate-500">{dateLabel}: ..............................</div>
    </div>
  );
}
