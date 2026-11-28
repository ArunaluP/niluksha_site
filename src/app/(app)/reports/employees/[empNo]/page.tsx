import { ArrowLeft, BarChart3, CalendarCheck2, ClipboardList, Clock3, Wallet } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { withParams } from "@/components/app/list-tools";
import { Card, CardHeader, cn, EmptyState, money, niceDateTime, nicePeriod, niceTime, PageHeader, Table, Td, Th } from "@/components/ui";
import { listBranches } from "@/features/branches/service";
import { EmployeeReportQuery, getEmployeeSessions } from "@/features/reports/employees";
import { BarChart } from "../../bar-chart";
import { requirePermission } from "@/lib/dal";
import { NotFoundError } from "@/lib/errors";
import { hospitalPlace } from "@/lib/lk-rules";
import { PeriodFilter } from "../../period-filter";
import { AutoPrint, PrintButton } from "../../activity/print-tools";
import { ExportButton } from "../../export-button";
import { PrintHeader } from "../../print-header";
import { driveInfoFor } from "@/features/drive/service";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Employee sessions · Care Booking" };

/** /reports/employees/EMP-0007 — one employee's finished sessions in the period, with a daily chart. */
export default async function EmployeeSessionsPage({ params, searchParams }: PageProps<"/reports/employees/[empNo]">) {
  const user = await requirePermission("viewReports");
  const { empNo } = await params;
  const raw = Object.fromEntries(Object.entries(await searchParams).filter(([, v]) => typeof v === "string" && v !== "")) as Record<string, string>;
  const isDirector = user.role === "admin";
  const printMode = raw.print === "1";

  const parsed = EmployeeReportQuery.safeParse(raw);
  const error = parsed.success ? null : (parsed.error.issues[0]?.message ?? "Invalid filters.");
  const q = parsed.success ? parsed.data : EmployeeReportQuery.parse({});

  const [r, branchList, drive, settings] = await Promise.all([
    getEmployeeSessions(user, decodeURIComponent(empNo), q).catch((e) => {
      if (e instanceof NotFoundError) notFound();
      throw e;
    }),
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
  const path = `/reports/employees/${r.employee.empNo}`;
  const backHref = withParams("/reports/employees", base, { page: raw.page });
  // "← Back to Reports" on the booking page returns to this employee page.
  const here = withParams(path, base, { page: raw.page });
  const bookingHref = (bookingNo: string) => `/bookings/${bookingNo}?from=reports&back=${encodeURIComponent(here)}`;

  return (
    <div className="space-y-5">
      {printMode && <AutoPrint />}
      {printMode && <style>{"@media print { @page { size: A4 landscape; margin: 10mm; } }"}</style>}
      <PrintHeader
        company={settings.company_name}
        title={`Employee report · ${r.employee.fullName} (${r.employee.empNo}, ${r.employee.branchName})`}
        subtitle={r.period.label}
        by={user.name}
      />
      <div className="no-print">
        <Link href={backHref} className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-accent">
          <ArrowLeft size={14} /> Employee Reports
        </Link>
        <PageHeader
          title={r.employee.fullName}
          subtitle={
            <span className="inline-flex flex-wrap items-center gap-x-2">
              <span>
                {r.employee.empNo} · {r.employee.designation} · {r.employee.branchName}
              </span>
              <span className="text-muted/70">·</span>
              <span>{r.period.label}</span>
            </span>
          }
          actions={
            <>
              <Link href={`/employees/${r.employee.id}`} className="mr-2 text-sm text-accent hover:underline">
                Employee profile →
              </Link>
              <PrintButton href={printMode ? undefined : withParams(path, base, { print: "1" })} />
              <ExportButton report="employee" empNo={r.employee.empNo} filters={base} drive={drive} />
            </>
          }
        />
      </div>

      {error && <div className="no-print rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700">{error} Showing this month instead.</div>}

      {!printMode && <PeriodFilter path={path} base={base} custom={raw.custom === "1"} branches={isDirector ? branchList : undefined} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4">
        <Stat icon={<ClipboardList size={16} />} label="Finished sessions" value={String(r.totals.sessions)} cls="text-emerald-700" />
        <Stat icon={<CalendarCheck2 size={16} />} label="Days worked" value={String(r.totals.daysWorked)} />
        <Stat icon={<Clock3 size={16} />} label="Hours of care" value={`${r.totals.hours} h`} cls="text-violet-700" />
        <Stat icon={<Wallet size={16} />} label="Value" value={money(r.totals.value)} cls="text-accent" />
      </div>

      <Card strong>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <BarChart3 size={16} className="text-accent" /> Completed sessions per {r.chart.unit}
            </span>
          }
          subtitle={r.chart.unit === "week" ? "Long period: bars are weeks (Monday to Sunday)." : undefined}
        />
        <div className="px-5 pb-5">
          <BarChart chart={r.chart} />
        </div>
      </Card>

      <Card strong>
        <CardHeader title="Finished sessions" subtitle="Newest first · open a booking to see its full journey" />
        {r.sessions.length === 0 ? (
          <EmptyState icon={<ClipboardList size={22} />} title="No finished sessions in this period" text="Only sessions whose invoice is printed are counted." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Session</Th>
                <Th>Booking</Th>
                <Th>Customer / patient</Th>
                <Th>Package</Th>
                <Th>Location</Th>
                <Th className="text-right">Rate</Th>
                <Th>Invoice</Th>
              </tr>
            </thead>
            <tbody>
              {r.sessions.map((s) => (
                <tr key={s.id} className="hover:bg-white/50">
                  <Td className="whitespace-nowrap">
                    <div className="font-medium">{nicePeriod(s.serviceDate, s.days)}</div>
                    <div className="text-xs text-muted">
                      from {niceTime(s.startTime)}
                      {s.days > 1 ? ` · ${s.daysInPeriod === s.days ? `${s.days} days` : `${s.daysInPeriod} of ${s.days} days in this period`}` : ""}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <Link href={bookingHref(s.bookingNo)} className="font-semibold text-accent hover:underline">
                      {s.bookingNo}
                    </Link>
                    <div className="text-xs text-muted">{s.branchName ?? ""}</div>
                  </Td>
                  <Td>
                    <div className="font-medium">{s.customerName}</div>
                    <div className="text-xs text-muted">
                      {s.patientName} · {s.customerPhone}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <div>{s.packageName ?? "—"}</div>
                    <div className="text-xs text-muted">{s.durationHours} hours</div>
                  </Td>
                  <Td className="max-w-[240px]">
                    <div className="truncate">{s.locationType === "hospital" ? hospitalPlace(s.hospitalName, s.wardNo, s.bedNo) : (s.serviceAddress ?? "Home")}</div>
                    <div className="text-xs text-muted">{s.locationType === "hospital" ? "Hospital" : "Home"}</div>
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    <div className="font-medium">{money(Number(s.rate) * s.daysInPeriod)}</div>
                    {s.daysInPeriod > 1 && <div className="text-xs text-muted">{money(s.rate)} × {s.daysInPeriod}</div>}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {s.invoiceId ? (
                      <Link href={`/invoices/${s.invoiceId}`} className="text-accent hover:underline">
                        {s.invoiceNo}
                      </Link>
                    ) : (
                      "—"
                    )}
                    {s.printedAt && <div className="text-xs text-muted">printed {niceDateTime(s.printedAt)}</div>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function Stat({ icon, label, value, cls }: { icon: ReactNode; label: string; value: string; cls?: string }) {
  return (
    <div className="glass px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
        <span className="text-accent">{icon}</span> {label}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold text-ink", cls)}>{value}</div>
    </div>
  );
}
