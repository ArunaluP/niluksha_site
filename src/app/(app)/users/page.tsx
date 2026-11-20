import { asc } from "drizzle-orm";
import { EntityFormButton, type FieldDef } from "@/components/app/entity-form";
import { Avatar, Card, PageHeader, StatusBadge, Table, Td, Th, niceDateTime } from "@/components/ui";
import { db } from "@/db";
import { branches } from "@/db/schema";
import { listUsers } from "@/features/users/service";
import { requirePermission } from "@/lib/dal";
import { ROLE_LABELS } from "@/lib/permissions";
import { createUserAction, updateUserAction } from "../_actions/records";

export const metadata = { title: "Users · Care Booking" };

export default async function UsersPage() {
  const me = await requirePermission("manageUsers");
  const [list, branchList] = await Promise.all([listUsers({}), db.select({ id: branches.id, name: branches.name }).from(branches).orderBy(asc(branches.name))]);

  const fields: FieldDef[] = [
    { name: "name", label: "Full name", required: true },
    { name: "email", label: "Email (login)", type: "email", required: true },
    {
      name: "role",
      label: "Role",
      type: "select",
      required: true,
      options: [
        { value: "admin", label: "Director — full access" },
        { value: "call_center", label: "Call Center — daily bookings & invoices" },
        { value: "branch_manager", label: "Branch Manager — view own branch" },
      ],
    },
    { name: "branchId", label: "Branch", type: "select", numeric: true, options: branchList.map((b) => ({ value: String(b.id), label: b.name })), hint: "Required for Branch Managers" },
    { name: "password", label: "Password", type: "password", required: true, createOnly: true, hint: "At least 8 characters" },
    { name: "password", label: "New password", type: "password", editOnly: true, hint: "Leave empty to keep the current password" },
    { name: "isActive", label: "Can log in (uncheck to disable the account)", type: "checkbox", editOnly: true, full: true },
  ];

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Staff logins and what each one can do"
        actions={<EntityFormButton mode="create" title="Add user" fields={fields} initial={{ role: "call_center" }} action={createUserAction} success="User created" buttonLabel="Add user" />}
      />
      <Card strong>
        <Table>
          <thead>
            <tr>
              <Th>User</Th>
              <Th>Role</Th>
              <Th>Branch</Th>
              <Th>Last login</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id} className="hover:bg-white/50">
                <Td className="min-w-[230px]">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={u.name} size="sm" />
                    <div>
                      <div className="font-medium">
                        {u.name} {u.id === me.id && <span className="text-xs text-muted">(you)</span>}
                      </div>
                      <div className="text-xs text-muted">{u.email}</div>
                    </div>
                  </div>
                </Td>
                <Td>{ROLE_LABELS[u.role]}</Td>
                <Td>{u.branchName ?? "—"}</Td>
                <Td className="whitespace-nowrap text-muted">{u.lastLoginAt ? niceDateTime(u.lastLoginAt) : "Never"}</Td>
                <Td>
                  <StatusBadge status={u.isActive ? "active" : "inactive"} />
                </Td>
                <Td className="text-right">
                  <EntityFormButton
                    mode="edit"
                    title={`Edit ${u.name}`}
                    fields={fields}
                    initial={{ name: u.name, email: u.email, role: u.role, branchId: u.branchId ? String(u.branchId) : "", isActive: u.isActive }}
                    extra={{ id: u.id }}
                    action={updateUserAction}
                    success="User updated"
                    buttonSize="sm"
                    buttonVariant="ghost"
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
