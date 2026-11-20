import { and, count, eq } from "drizzle-orm";
import { Building2, Phone, UserRound } from "lucide-react";
import Link from "next/link";
import { EntityFormButton, type FieldDef } from "@/components/app/entity-form";
import { Card, PageHeader, StatusBadge } from "@/components/ui";
import { db } from "@/db";
import { employees, users } from "@/db/schema";
import { listBranches } from "@/features/branches/service";
import { requirePermission } from "@/lib/dal";
import { hasPermission } from "@/lib/permissions";
import { createBranchAction, updateBranchAction } from "../_actions/records";

export const metadata = { title: "Branches · Care Booking" };

export default async function BranchesPage() {
  const user = await requirePermission("viewMasterData");
  const [list, managers, staffCounts] = await Promise.all([
    listBranches({}),
    db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.role, "branch_manager"), eq(users.isActive, true))),
    db.select({ branchId: employees.branchId, total: count() }).from(employees).where(eq(employees.status, "active")).groupBy(employees.branchId),
  ]);
  const canEdit = hasPermission(user, "manageBranches");
  const fields: FieldDef[] = [
    { name: "code", label: "Code", required: true, placeholder: "KDW" },
    { name: "name", label: "Name", required: true, placeholder: "Kadawatha" },
    { name: "phone", label: "Phone" },
    { name: "managerUserId", label: "Branch manager", type: "select", numeric: true, options: managers.map((m) => ({ value: String(m.id), label: m.name })), hint: "A user with the Branch Manager role" },
    { name: "address", label: "Address", full: true },
    { name: "isActive", label: "Active", type: "checkbox", editOnly: true, full: true },
  ];
  const visible = user.role === "branch_manager" ? list.filter((b) => b.id === user.branchId) : list;

  return (
    <div>
      <PageHeader
        title="Branches"
        subtitle="Every employee belongs to a branch; head office assigns across all of them"
        actions={canEdit && <EntityFormButton mode="create" title="Add branch" fields={fields} action={createBranchAction} success="Branch added" buttonLabel="Add branch" />}
      />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((b) => (
          <Card key={b.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#6658f5] to-[#a78bfa] text-sm font-semibold text-white shadow">{b.code}</span>
                <div>
                  <div className="font-semibold">{b.name}</div>
                  <StatusBadge status={b.isActive ? "active" : "inactive"} />
                </div>
              </div>
              {canEdit && (
                <EntityFormButton
                  mode="edit"
                  title={`Edit ${b.name}`}
                  fields={fields}
                  initial={{ code: b.code, name: b.name, phone: b.phone ?? "", address: b.address ?? "", managerUserId: b.managerUserId ? String(b.managerUserId) : "", isActive: b.isActive }}
                  extra={{ id: b.id }}
                  action={updateBranchAction}
                  success="Branch updated"
                  buttonSize="sm"
                  buttonVariant="ghost"
                />
              )}
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex items-center gap-2 text-ink/80">
                <UserRound size={14} className="text-accent" /> {b.managerName ?? <span className="text-muted">No manager set</span>}
              </div>
              <div className="flex items-center gap-2 text-ink/80">
                <Phone size={14} className="text-accent" /> {b.phone ?? "—"}
              </div>
              {b.address && (
                <div className="flex items-center gap-2 text-ink/80">
                  <Building2 size={14} className="text-accent" /> {b.address}
                </div>
              )}
            </div>
            <Link href={`/employees?branchId=${b.id}`} className="mt-4 flex items-center justify-between rounded-xl bg-white/60 px-3 py-2 text-sm hover:bg-white/90">
              <span className="text-muted">Active staff</span>
              <span className="font-semibold">{staffCounts.find((s) => s.branchId === b.id)?.total ?? 0}</span>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
