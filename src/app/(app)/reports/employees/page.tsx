import { ArrowLeft, BarChart3, ChevronRight, Medal, Trophy, UsersRound } from "lucide-react";
import Link from "next/link";
import { Pager, withParams } from "@/components/app/list-tools";
import { Avatar, Card, CardHeader, cn, EmptyState, money, niceDate, PageHeader, Table, Td, Th } from "@/components/ui";
import { listBranches } from "@/features/branches/service";
import { EmployeeReportQuery, getEmployeeRanking } from "@/features/reports/employees";
import { requirePermission } from "@/lib/dal";
import { BarChart } from "../bar-chart";
import { PeriodFilter } from "../period-filter";
import { AutoPrint, PrintButton } from "../activity/print-tools";
import { ExportButton } from "../export-button";
import { driveInfoFor } from "@/features/drive/service";
import { getSettings } from "@/lib/settings";
import { PrintHeader } from "../print-header";

export const metadata = { title: "Employee Reports · Care Booking" };

const MEDAL = ["text-amber-500", "text-slate-400", "text-orange-400"];

export default async function EmployeeReportPage({ searchParams }: PageProps<"/reports/employees">) {
  const user = await requirePermission("viewReports");
  const raw = Object.fromEntries(Object.entries(await searchParams).filter(([, v]) => typeof v === "string" && v !== "")) as Record<string, string>;
  const isDirector = user.role === "admin";
  const printMode = raw.print === "1";

  const parsed = EmployeeReportQuery.safeParse(raw);
  const error = parsed.success ? null : (parsed.error.issues[0]?.message ?? "Invalid filters.");
  const q = parsed.success ? parsed.data : EmployeeReportQuery.parse({});

  const [r, branchList, drive, settings] = await Promise.all([
    getEmployeeRanking(user, q, { all: printMode }),
    isDirector ? listBranches({}) : Promise.resolve([]),
    driveInfoFor(user),
    getSettings(),
  ]);

  const base = {
    from: q.from,
    to: q.to,
    branchId: isDirector && q.branchId ? String(q.branchId) : undefined,
    custom: raw.custom === "1" ? "1" : undefined,
  };
  const branchName = isDirector && q.branchId ? branchList.find((b) => b.id === q.branchId)?.name : undefined;
  const subtitle = `${r.period.label}${branchName ? ` · ${branchName}` : user.role === "branch_manager" ? " · your branch" : ""} · finished sessions = invoice printed`;
  const max = r.items[0]?.sessions ?? 0;
  // The employee page keeps the same period/branch and can come back here.
  const detailHref = (empNo: string) => withParams(`/reports/employees/${empNo}`, base, { page: r.page > 1 ? String(r.page) : undefined });

  return (
    <div className="space-y-5">
      {printMode && <AutoPrint />}
      {printMode && <style>{"@media print { @page { size: A4 landscape; margin: 10mm; } }"}</style>}
      <PrintHeader company={settings.company_name} title="Employee report" subtitle={subtitle} by={user.name} />
      <div className="no-print">
        <Link href="/reports" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-accent">
          <ArrowLeft size={14} /> Reports
        </Link>
        <PageHeader
          title="Employee Reports"
          subtitle={subtitle}
          actions={
            <>
              <PrintButton href={printMode ? undefined : withParams("/reports/employees", base, { print: "1" })} />
              <ExportButton report="employees" filters={base} drive={drive} />
            </>
          }
        />
      </div>

      {error && <div className="no-print rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700">{error} Showing this month instead.</div>}

      {!printMode && <PeriodFilter path="/reports/employees" base={base} custom={raw.custom === "1"} branches={isDirector ? branchList : undefined} />}

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4">
        <Stat label="Employees who worked" value={String(r.totals.employees)} />
        <Stat label="Finished sessions" value={String(r.totals.sessions)} cls="text-emerald-700" />
        <Stat label="Hours of care" value={`${r.totals.hours} h`} cls="text-violet-700" />
        <Stat label="Value" value={money(r.totals.value)} cls="text-accent" />
      </div>

      {r.totals.sessions > 0 && (
        <Card strong>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <BarChart3 size={16} className="text-accent" /> Finished sessions per {r.chart.unit} (all employees)
              </span>
            }
            subtitle={r.chart.unit === "week" ? "Long period: bars are weeks (Monday to Sunday)." : undefined}
          />
          <div className="px-5 pb-5">
            <BarChart chart={r.chart} />
          </div>
        </Card>
      )}

      <Card strong>
        {r.items.length === 0 ? (
          <EmptyState icon={<UsersRound size={22} />} title="No finished sessions in this period" text="Only sessions whose invoice is printed count as finished." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-16 text-center">Rank</Th>
                <Th>Employee</Th>
                <Th>Branch</Th>
                <Th className="min-w-[200px]">Finished sessions</Th>
                <Th className="text-right">Days</Th>
                <Th className="text-right">Hours</Th>
                <Th className="text-right">Value</Th>
                <Th>Last worked</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {r.items.map((e) => (
                <tr key={e.employeeId} className="group relative cursor-pointer transition hover:bg-white/60">
                  <Td className="text-center">
                    {e.rank <= 3 ? (
                      <span className={cn("inline-flex items-center justify-center", MEDAL[e.rank - 1])} title={`Rank ${e.rank}`}>
                        {e.rank === 1 ? <Trophy size={20} /> : <Medal size={20} />}
                      </span>
                    ) : (
                      <span className="font-semibold text-muted">{e.rank}</span>
                    )}
                  </Td>
                  <Td>
                    {/* The link covers the whole row (after: pseudo-element), so the row is clickable. */}
                    <Link href={detailHref(e.empNo)} className="flex items-center gap-3 after:absolute after:inset-0 after:content-['']">
                      <Avatar name={e.fullName} />
                      <div>
                        <div className="font-medium text-ink group-hover:text-accent">{e.fullName}</div>
                        <div className="text-xs text-muted">
                          {e.empNo} · {e.designation}
                          {e.status === "inactive" ? " · inactive" : ""}
                        </div>
                      </div>
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap">{e.branchName ?? "—"}</Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      <span className="w-8 text-lg font-semibold text-ink">{e.sessions}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-indigo-100/70">
                        <span className="block h-full rounded-full bg-gradient-to-r from-accent to-accent-2" style={{ width: `${max ? Math.max(4, (e.sessions / max) * 100) : 0}%` }} />
                      </span>
                    </div>
                  </Td>
                  <Td className="text-right">{e.daysWorked}</Td>
                  <Td className="text-right">{e.hours}</Td>
                  <Td className="text-right whitespace-nowrap font-medium">{money(e.value)}</Td>
                  <Td className="whitespace-nowrap">{niceDate(e.lastWorked)}</Td>
                  <Td className="text-right">
                    <ChevronRight size={16} className="no-print text-muted group-hover:text-accent" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {!printMode && <Pager page={r.page} pageSize={r.pageSize} total={r.total} href={(p) => withParams("/reports/employees", base, { page: String(p) })} />}
      </Card>
      <p className="text-xs text-muted">
        Ranked by finished sessions in the period. When two employees have the same number, the one who worked more recently comes first.
      </p>
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="glass px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold text-ink", cls)}>{value}</div>
    </div>
  );
}

