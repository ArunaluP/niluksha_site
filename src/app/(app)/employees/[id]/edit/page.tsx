import { asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { employeePhotoUrl, niceDateTime } from "@/components/ui";
import { db } from "@/db";
import { branches, DESIGNATIONS } from "@/db/schema";
import { getEmployee, listReferrers } from "@/features/employees/service";
import { requirePermission } from "@/lib/dal";
import { branchScope } from "@/lib/permissions";
import { NotFoundError } from "@/lib/errors";
import { getSettings } from "@/lib/settings";
import { RegistrationForm } from "../../registration-form";

export const metadata = { title: "Edit employee · Care Booking" };

export default async function EditEmployeePage({ params }: PageProps<"/employees/[id]/edit">) {
  const user = await requirePermission("manageEmployees");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const e = await getEmployee(id, user).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const [branchList, referrers, settings] = await Promise.all([
    // Branch managers register staff for their own branch only (the Branch field has just that one).
    db.select({ id: branches.id, name: branches.name }).from(branches).where(branchScope(user, branches.id)).orderBy(asc(branches.name)),
    listReferrers(user),
    getSettings(),
  ]);
  const s = (x: string | number | null) => (x == null ? "" : String(x));

  return (
    <RegistrationForm
      mode="edit"
      employeeId={e.id}
      empNo={e.empNo}
      initial={{
        fileNo: s(e.fileNo),
        designation: e.designation,
        branchId: String(e.branchId),
        joinDate: s(e.joinDate),
        status: e.status,
        // the form has no middle name any more: an old middle name is kept in the first-name box
        firstName: [e.firstName, e.middleName].filter(Boolean).join(" "),
        lastName: e.lastName,
        nic: s(e.nic),
        gender: e.gender,
        dob: s(e.dob),
        phone: e.phone,
        altPhone: s(e.altPhone),
        email: s(e.email),
        address: s(e.address),
        gnDivision: s(e.gnDivision),
        district: s(e.district),
        nearestPolice: s(e.nearestPolice),
        nearestPostOffice: s(e.nearestPostOffice),
        qualifications: s(e.qualifications),
        guardianName: s(e.guardianName),
        guardianRelationship: s(e.guardianRelationship),
        guardianAddress: s(e.guardianAddress),
        guardianPhone: s(e.guardianPhone),
        heardFrom: s(e.heardFrom),
        referredBy: s(e.referredBy),
        docs: {
          docGnCertificate: e.docGnCertificate,
          docNicCopy: e.docNicCopy,
          docPoliceCertificate: e.docPoliceCertificate,
          docCharacterCertificate: e.docCharacterCertificate,
          docBirthCertificate: e.docBirthCertificate,
        },
        rulesAgreed: Boolean(e.rulesAgreedAt),
      }}
      branches={branchList}
      referrers={referrers}
      designations={DESIGNATIONS}
      company={settings.company_name ?? ""}
      photoUrl={employeePhotoUrl(e)}
      agreedNote={e.rulesAgreedAt ? `Agreed ${niceDateTime(e.rulesAgreedAt)}${e.rulesAgreedByName ? ` · recorded by ${e.rulesAgreedByName}` : ""}` : null}
    />
  );
}
