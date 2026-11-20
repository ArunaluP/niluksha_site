import { asc } from "drizzle-orm";
import { Search, UserRound } from "lucide-react";
import Link from "next/link";
import { EntityFormButton } from "@/components/app/entity-form";
import { Pager, withParams } from "@/components/app/list-tools";
import { Avatar, Button, Card, cn, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui";
import { db } from "@/db";
import { branches, DESIGNATIONS } from "@/db/schema";
import { EmployeeListQuery, listEmployees } from "@/features/employees/service";
import { requirePermission } from "@/lib/dal";
import { hasPermission } from "@/lib/permissions";
import { createEmployeeAction } from "../_actions/records";
import { employeeFields } from "./fields";

export const metadata = { title: "Employees · Care Booking" };

type Row = { id: number; empNo: string; fullName: string; designation: string; branchId: number; branchName: string; phone: string; nic: string | null; status: string };

export default async function EmployeesPage({ searchParams }: PageProps<"/employees">) {
  const user = await requirePermission("viewMasterData");
  const raw = Object.fromEntries(Object.entries(await searchParams).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const parsed = EmployeeListQuery.safeParse(raw);
  const q = parsed.success ? parsed.data : EmployeeListQuery.parse({});
  const [data, branchList] = await Promise.all([listEmployees(q, user), db.select({ id: branches.id, name: branches.name }).from(branches).orderBy(asc(branches.name))]);
  const items = data.items as Row[];
  const canEdit = hasPermission(user, "manageEmployees");
  const isManager = user.role === "branch_manager";

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle={isManager ? "Staff of your branch (view only)" : "Caregivers, nurses and office staff across all branches"}
        actions={canEdit && <EntityFormButton mode="create" title="Add employee" subtitle="An employee number is created automatically" fields={employeeFields(branchList)} initial={{ designation: "Caregiver" }} action={createEmployeeAction} success="Employee added" buttonLabel="Add employee" wide />}
      />

      <div className="grid gap-5 lg:grid-cols-[230px_1fr] lg:items-start">
        <div className="space-y-5">
          <Card className="p-4">
            <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Type</div>
            <FilterLink href={withParams("/employees", raw, { designation: undefined, page: undefined })} active={!raw.designation} label="All types" />
            {DESIGNATIONS.map((d) => (
              <FilterLink key={d} href={withParams("/employees", raw, { designation: d, page: undefined })} active={raw.designation === d} label={d} />
            ))}
          </Card>
          {!isManager && (
            <Card className="p-4">
              <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Branch</div>
              <FilterLink href={withParams("/employees", raw, { branchId: undefined, page: undefined })} active={!raw.branchId} label="All branches" />
              {branchList.map((b) => (
                <FilterLink key={b.id} href={withParams("/employees", raw, { branchId: b.id, page: undefined })} active={raw.branchId === String(b.id)} label={b.name} />
              ))}
            </Card>
          )}
        </div>

        <Card strong className="min-w-0">
          <form action="/employees" className="flex flex-wrap items-center gap-2 border-b border-indigo-100/60 px-4 py-3">
            {raw.designation && <input type="hidden" name="designation" value={raw.designation} />}
            {raw.branchId && <input type="hidden" name="branchId" value={raw.branchId} />}
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input name="search" defaultValue={raw.search} placeholder="Name, number, phone, NIC" className="field w-64 py-1.5 pl-8" />
            </div>
            <select name="status" defaultValue={raw.status ?? ""} className="field w-36 py-1.5">
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <Button size="sm" variant="secondary">
              Filter
            </Button>
          </form>

          {items.length === 0 ? (
            <EmptyState icon={<UserRound size={22} />} title="No employees found" />
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>Employee</Th>
                    <Th>Type</Th>
                    <Th>Branch</Th>
                    <Th>Phone</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((e) => (
                    <tr key={e.id} className="transition hover:bg-white/50">
                      <Td className="min-w-[220px]">
                        <Link href={`/employees/${e.id}`} className="flex items-center gap-2.5">
                          <Avatar name={e.fullName} size="sm" />
                          <div>
                            <div className="font-medium hover:text-accent">{e.fullName}</div>
                            <div className="text-xs text-muted">{e.empNo}</div>
                          </div>
                        </Link>
                      </Td>
                      <Td>
                        <span className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", ["Caregiver", "Nurse"].includes(e.designation) ? "bg-violet-100/80 text-violet-800" : "bg-slate-100/90 text-slate-600")}>{e.designation}</span>
                      </Td>
                      <Td>{e.branchName}</Td>
                      <Td className="whitespace-nowrap">{e.phone}</Td>
                      <Td>
                        <StatusBadge status={e.status} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Pager page={data.page} pageSize={data.pageSize} total={data.total} href={(p) => withParams("/employees", raw, { page: p })} />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function FilterLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link href={href} className={cn("mb-0.5 block rounded-xl px-3 py-1.5 text-sm transition", active ? "bg-accent-soft/90 font-medium text-accent" : "text-ink/75 hover:bg-white/60")}>
      {label}
    </Link>
  );
}
