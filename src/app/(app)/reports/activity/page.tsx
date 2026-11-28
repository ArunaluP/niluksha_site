import { ArrowLeft, BarChart3, X } from "lucide-react";
import Link from "next/link";
import { Pager, Tabs, withParams } from "@/components/app/list-tools";
import { Button, Card, CardHeader, cn, EmptyState, money, niceDate, niceTime, PageHeader, Select, StatusBadge, Table, Td, Th } from "@/components/ui";
import { listBranches } from "@/features/branches/service";
import { EVENT_LABELS, stepsLabel, type EventKey } from "@/features/reports/events";
import { getActivityReport, ReportQuery, type ActivityEvent } from "@/features/reports/service";
import { requirePermission } from "@/lib/dal";
import { addDays, toIsoDate, today } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { Suspense } from "react";
import { JourneyPanel, JourneyRow } from "./journey-panel";
import { AutoPrint, PrintButton } from "./print-tools";
import { ExportButton } from "../export-button";
import { driveInfoFor } from "@/features/drive/service";

export const metadata = { title: "Customer Reports · Care Booking" };

/** The count cards. "Assigned" also counts reassignments (and its filter shows both). */
const CARDS: { key: EventKey; label: string; cls: string }[] = [
  { key: "created", label: "New bookings", cls: "text-amber-700" },
  { key: "confirmed", label: "Confirmed", cls: "text-sky-700" },
  { key: "ignored", label: "Ignored", cls: "text-rose-700" },
  { key: "assigned", label: "Assigned", cls: "text-violet-700" },
  { key: "unassigned", label: "Unassigned", cls: "text-orange-700" },
  { key: "delivered", label: "Delivered", cls: "text-emerald-700" },
  { key: "invoice_printed", label: "Invoices printed", cls: "text-slate-700" },
];

const EVENT_PILL: Record<EventKey, string> = {
  created: "bg-amber-100/80 text-amber-800 border-amber-200",
  confirmed: "bg-sky-100/80 text-sky-800 border-sky-200",
  ignored: "bg-rose-100/80 text-rose-700 border-rose-200",
  assigned: "bg-violet-100/80 text-violet-800 border-violet-200",
  reassigned: "bg-fuchsia-100/80 text-fuchsia-800 border-fuchsia-200",
  unassigned: "bg-orange-100/80 text-orange-800 border-orange-200",
  delivered: "bg-emerald-100/80 text-emerald-800 border-emerald-200",
  invoice_printed: "bg-slate-100/90 text-slate-700 border-slate-200",
};

const time24 = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", hour: "2-digit", minute: "2-digit", hour12: false });
const eventTime = (at: Date) => niceTime(time24.format(new Date(at)));

/** Today, yesterday, Monday → today, 1st of month → today (Sri Lanka dates). */
function presets() {
  const t = today();
  const [y, m, d] = t.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return [
    { key: "today", label: "Today", from: t, to: t },
    { key: "yesterday", label: "Yesterday", from: addDays(t, -1), to: addDays(t, -1) },
    { key: "week", label: "This week", from: addDays(t, -((dow + 6) % 7)), to: t },
    { key: "month", label: "This month", from: `${t.slice(0, 8)}01`, to: t },
  ];
}

export default async function ReportsPage({ searchParams }: PageProps<"/reports/activity">) {
  const user = await requirePermission("viewReports");
  const raw = Object.fromEntries(Object.entries(await searchParams).filter(([, v]) => typeof v === "string" && v !== "")) as Record<string, string>;
  const printMode = raw.print === "1";
  const isDirector = user.role === "admin";

  const parsed = ReportQuery.safeParse(raw);
  const error = parsed.success ? null : (parsed.error.issues[0]?.message ?? "Invalid filters.");
  const q = parsed.success ? parsed.data : ReportQuery.parse({});

  const [r, settings, branchList, drive] = await Promise.all([
    getActivityReport(user, q, { all: printMode }),
    getSettings(),
    isDirector ? listBranches({}) : Promise.resolve([]),
    driveInfoFor(user),
  ]);

  // Links keep the current filters (validated values, not the raw URL).
  const base = {
    from: q.from,
    to: q.to,
    event: q.event,
    branchId: isDirector && q.branchId ? String(q.branchId) : undefined,
    custom: raw.custom === "1" ? "1" : undefined,
  };
  const branchName = isDirector && q.branchId ? branchList.find((b) => b.id === q.branchId)?.name : undefined;
  const single = q.from === q.to;
  const PRESETS = presets();
  const activePreset = raw.custom === "1" ? "custom" : (PRESETS.find((p) => p.from === q.from && p.to === q.to)?.key ?? "custom");
  const assignedTotal = r.counts.assigned + r.counts.reassigned;
  const subtitle = `${r.period.label}${branchName ? ` · ${branchName}` : user.role === "branch_manager" ? " · your branch" : ""}`;
  // Where "← Back to Reports" on a booking page returns to: these filters + this page.
  const backHref = withParams("/reports/activity", base, { page: r.page > 1 ? r.page : undefined });

  return (
    <div className="space-y-5">
      {printMode && <AutoPrint />}
      {printMode && <style>{"@media print { @page { size: A4 landscape; margin: 10mm; } }"}</style>}

      {/* Print-only header */}
      <div className="hidden border-b border-slate-300 pb-3 print:block">
        <div className="text-lg font-semibold text-slate-900">{settings.company_name || "Care Services"}</div>
        <div className="text-sm text-slate-700">
          Customer report (activity) · {subtitle}
          {q.event ? ` · ${EVENT_LABELS[q.event]} only` : ""}
        </div>
        <div className="text-xs text-slate-500">
          Printed {niceDate(today())} {eventTime(new Date())} by {user.name}
        </div>
      </div>

      <div className="no-print">
        {printMode && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-white/70 px-4 py-2 text-sm text-muted">
            <span>Print view: all {r.total} {r.total === 1 ? "booking" : "bookings"}, no paging.</span>
            <Link href={withParams("/reports/activity", base, {})} className="inline-flex items-center gap-1 text-accent hover:underline">
              <ArrowLeft size={14} /> Back to report
            </Link>
          </div>
        )}
        {!printMode && (
          <Link href="/reports" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-accent">
            <ArrowLeft size={14} /> Reports
          </Link>
        )}
        <PageHeader
          title="Customer Reports"
          subtitle={subtitle}
          actions={
            <>
              <PrintButton href={printMode ? undefined : withParams("/reports/activity", base, { print: "1" })} />
<ExportButton report="activity" filters={{ from: q.from, to: q.to, event: q.event, branchId: base.branchId }} drive={drive} />
            </>
          }
        />
      </div>

      {error && <div className="no-print rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700">{error} Showing today instead.</div>}

      {/* Filters */}
      {!printMode && (
        <Card strong className="no-print flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Tabs
            items={[
              ...PRESETS.map((p) => ({ href: withParams("/reports/activity", base, { from: p.from, to: p.to, page: undefined, custom: undefined }), label: p.label, active: activePreset === p.key })),
              { href: withParams("/reports/activity", base, { custom: "1" }), label: "Custom", active: activePreset === "custom" },
            ]}
          />
          {(activePreset === "custom" || isDirector) && (
            <form action="/reports/activity" className="flex flex-wrap items-center gap-2">
              {q.event && <input type="hidden" name="event" value={q.event} />}
              {activePreset === "custom" ? (
                <>
                  <input type="hidden" name="custom" value="1" />
                  <input type="date" name="from" defaultValue={q.from} max={today()} className="field w-auto py-1.5" title="From date" aria-label="From date" />
                  <span className="text-xs text-muted">to</span>
                  <input type="date" name="to" defaultValue={q.to} max={today()} className="field w-auto py-1.5" title="To date" aria-label="To date" />
                </>
              ) : (
                <>
                  <input type="hidden" name="from" value={q.from} />
                  <input type="hidden" name="to" value={q.to} />
                </>
              )}
              {isDirector && (
                <Select name="branchId" defaultValue={base.branchId ?? ""} className="w-auto py-1.5" aria-label="Branch">
                  <option value="">All branches</option>
                  {branchList.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              )}
              <Button size="sm" variant="secondary">
                Apply
              </Button>
            </form>
          )}
        </Card>
      )}

      {/* Count cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7 print:grid-cols-7">
        {CARDS.map((c) => {
          const n = c.key === "assigned" ? assignedTotal : r.counts[c.key];
          const active = q.event === c.key;
          return (
            <Link
              key={c.key}
              href={withParams("/reports/activity", base, { event: active ? undefined : c.key, page: undefined })}
              className={cn(
                "glass break-inside-avoid px-4 py-3 transition hover:bg-white/80",
                active && "ring-2 ring-accent/70 bg-white/80",
              )}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{c.label}</div>
              <div className={cn("mt-1 text-2xl font-semibold", c.cls)}>{n}</div>
              {c.key === "assigned" && r.counts.reassigned > 0 && <div className="text-[11px] text-muted">incl. {r.counts.reassigned} reassigned</div>}
            </Link>
          );
        })}
      </div>

      {/* Money */}
      <div className="grid gap-3 md:grid-cols-2 print:grid-cols-2">
        <Card className="break-inside-avoid px-5 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Delivered value</div>
          <div className="mt-1 text-xl font-semibold text-emerald-700">
            {money(r.money.delivered.value)} <span className="text-sm font-normal text-muted">· {r.money.delivered.count} {r.money.delivered.count === 1 ? "session" : "sessions"}</span>
          </div>
        </Card>
        <Card className="break-inside-avoid px-5 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Invoices printed value</div>
          <div className="mt-1 text-xl font-semibold text-slate-800">
            {money(r.money.invoicesPrinted.value)}{" "}
            <span className="text-sm font-normal text-muted">
              · {r.money.invoicesPrinted.count} {r.money.invoicesPrinted.count === 1 ? "invoice" : "invoices"}
            </span>
          </div>
        </Card>
      </div>

      {/* Breakdowns of delivered sessions */}
      <div className="grid gap-3 md:grid-cols-2 print:grid-cols-2">
        <Card className="break-inside-avoid">
          <CardHeader title="Delivered by branch" subtitle="Sessions delivered in this period" />
          {r.byBranch.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted">No sessions delivered.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Branch</Th>
                  <Th className="text-right">Sessions</Th>
                  <Th className="text-right">Value</Th>
                </tr>
              </thead>
              <tbody>
                {r.byBranch.map((b) => (
                  <tr key={b.branchId ?? "none"}>
                    <Td>{b.branchName ?? "—"}</Td>
                    <Td className="text-right">{b.sessions}</Td>
                    <Td className="whitespace-nowrap text-right font-medium">{money(b.value)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card className="break-inside-avoid">
          <CardHeader title="Delivered by package" subtitle="Package name and hours as booked" />
          {r.byPackage.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted">No sessions delivered.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Package</Th>
                  <Th className="text-right">Hours</Th>
                  <Th className="text-right">Sessions</Th>
                  <Th className="text-right">Value</Th>
                </tr>
              </thead>
              <tbody>
                {r.byPackage.map((p) => (
                  <tr key={`${p.packageName}-${p.durationHours}`}>
                    <Td>{p.packageName ?? "—"}</Td>
                    <Td className="text-right">{p.durationHours}</Td>
                    <Td className="text-right">{p.sessions}</Td>
                    <Td className="whitespace-nowrap text-right font-medium">{money(p.value)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      {/* Event list */}
      <Card strong>
        <CardHeader
          title="Activity"
          subtitle={`${r.total} ${r.total === 1 ? "booking" : "bookings"}: one row each, showing the last step reached in this period (newest first)`}
          action={
            q.event && (
              <Link href={withParams("/reports/activity", base, { event: undefined, page: undefined })} className="no-print inline-flex items-center gap-1 rounded-lg bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent hover:brightness-95">
                {q.event === "assigned" ? "Assigned + reassigned" : EVENT_LABELS[q.event]} <X size={12} />
              </Link>
            )
          }
        />
        {r.events.length === 0 ? (
          <EmptyState icon={<BarChart3 size={22} />} title="Nothing happened in this period" text="Try another period, event type or branch." />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>{single ? "Time" : "Date / time"}</Th>
                  <Th>Last step</Th>
                  <Th>Booking</Th>
                  <Th>Customer</Th>
                  <Th>Patient</Th>
                  <Th>Session</Th>
                  <Th>Branch / employee</Th>
                  <Th>Current status</Th>
                  <Th>Done by</Th>
                  <Th>Note</Th>
                </tr>
              </thead>
              <tbody>
                {r.events.map((e) => (
                  <EventRow key={e.id} e={e} single={single} backHref={backHref} clickable={!printMode} />
                ))}
              </tbody>
            </Table>
            {!printMode && <Pager page={r.page} pageSize={r.pageSize} total={r.total} href={(p) => withParams("/reports/activity", base, { page: p })} />}
          </>
        )}
      </Card>

      {/* Click a row → the booking's journey slides in (?view=BK-…). */}
      {!printMode && (
        <Suspense fallback={null}>
          <JourneyPanel />
        </Suspense>
      )}
    </div>
  );
}

function EventRow({ e, single, backHref, clickable }: { e: ActivityEvent; single: boolean; backHref: string; clickable: boolean }) {
  const at = new Date(e.at);
  const cls = "break-inside-avoid align-top transition hover:bg-white/50";
  const cells = <EventCells e={e} at={at} single={single} backHref={backHref} />;
  return clickable ? (
    <JourneyRow bookingNo={e.bookingNo} className={cls}>
      {cells}
    </JourneyRow>
  ) : (
    <tr className={cls}>{cells}</tr>
  );
}

function EventCells({ e, at, single, backHref }: { e: ActivityEvent; at: Date; single: boolean; backHref: string }) {
  return (
    <>
      <Td className="whitespace-nowrap">
        {!single && <div className="font-medium">{niceDate(toIsoDate(at))}</div>}
        <div className={single ? "font-medium" : "text-xs text-muted"}>{eventTime(at)}</div>
      </Td>
      <Td className="whitespace-nowrap">
        {e.event ? (
          <span className={cn("inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-semibold", EVENT_PILL[e.event])}>{EVENT_LABELS[e.event]}</span>
        ) : (
          <span className="text-xs text-muted">
            {e.fromStatus ?? "—"} → {e.toStatus}
          </span>
        )}
        {(e.event === "delivered" || e.event === "invoice_printed") && e.invoiceNo && <div className="mt-1 text-xs text-muted">{e.invoiceNo}</div>}
        {e.steps.length > 1 && (
          <div className="mt-1 max-w-[220px] whitespace-normal text-[11px] leading-snug text-muted" title="Steps in this period">
            {stepsLabel(e.steps)}
          </div>
        )}
      </Td>
      <Td className="whitespace-nowrap">
        <Link href={`/bookings/${e.bookingNo}?from=reports&back=${encodeURIComponent(backHref)}`} className="font-semibold text-accent hover:underline">
          {e.bookingNo}
        </Link>
      </Td>
      <Td className="min-w-[150px]">
        <div className="font-medium">{e.customerName}</div>
        <div className="text-xs text-muted">{e.customerPhone}</div>
      </Td>
      <Td className="min-w-[130px]">{e.patientName}</Td>
      <Td className="whitespace-nowrap">
        <div>
          {niceDate(e.serviceDate)} · {niceTime(e.startTime)}
        </div>
        <div className="text-xs text-muted">
          {e.packageName ?? "—"} · {e.durationHours} h
        </div>
      </Td>
      <Td className="min-w-[130px]">
        {e.branchName || e.employeeName ? (
          <>
            <div>{e.branchName ?? "—"}</div>
            <div className="text-xs text-muted">{e.employeeName ?? "—"}</div>
          </>
        ) : (
          <span className="text-xs text-muted">Not assigned</span>
        )}
      </Td>
      <Td>
        <StatusBadge status={e.status} />
      </Td>
      <Td className="whitespace-nowrap">{e.doneBy}</Td>
      <Td className="min-w-[140px] text-xs text-muted">{e.note ?? ""}</Td>
    </>
  );
}
