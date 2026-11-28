import { asc } from "drizzle-orm";
import { db } from "@/db";
import { branches, DESIGNATIONS } from "@/db/schema";
import { listReferrers } from "@/features/employees/service";
import { requirePermission } from "@/lib/dal";
import { branchScope } from "@/lib/permissions";
import { today } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { RegistrationForm } from "../registration-form";

export const metadata = { title: "Register employee · Care Booking" };

export default async function NewEmployeePage() {
  const user = await requirePermission("manageEmployees");
  const [branchList, referrers, settings] = await Promise.all([
    // Branch managers register staff for their own branch only (the Branch field has just that one).
    db.select({ id: branches.id, name: branches.name }).from(branches).where(branchScope(user, branches.id)).orderBy(asc(branches.name)),
    listReferrers(user),
    getSettings(),
  ]);
  return (
    <RegistrationForm
      mode="create"
      initial={{ designation: "Caregiver", branchId: branchList.length === 1 ? String(branchList[0].id) : "", joinDate: today() }}
      branches={branchList}
      referrers={referrers}
      designations={DESIGNATIONS}
      company={settings.company_name ?? ""}
    />
  );
}
