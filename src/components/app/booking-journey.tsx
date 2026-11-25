import {
  CalendarClock,
  CalendarPlus,
  Check,
  CircleDot,
  FileText,
  Home,
  Hospital,
  Minus,
  PackageCheck,
  Phone,
  PhoneCall,
  Printer,
  Repeat,
  StickyNote,
  UserCheck,
  UserMinus,
  UserRound,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Avatar, Card, CardHeader, cn, money, niceDate, niceTime, StatusBadge } from "@/components/ui";
import type { BookingJourney, JourneyEmployee, JourneyEvent, MilestoneState } from "@/features/bookings/journey";
import type { EventKey } from "@/features/reports/events";
import { hospitalPlace, relationshipLabel } from "@/lib/lk-rules";

/**
 * The booking "journey": the whole flow of one booking as one picture.
 *   variant="page"  → full booking page (horizontal track, stat tiles, side cards)
 *   variant="panel" → Reports side panel (compact, vertical)
 * Plain component (no hooks): renders on the server (page) and in the client panel.
 */

// ======================================================================= formatting helpers
/** 45 → "45 min", 200 → "3 h 20 min", 1620 → "1 d 3 h". */
export function formatDuration(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) return "—";
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  return h ? `${d} d ${h} h` : `${d} d`;
}

/** "just now", "12 min ago", "3 h ago", "2 d ago" */
export function timeAgo(iso: string, now: number) {
  const min = Math.round((now - Date.parse(iso)) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  if (min < 1440) return `${Math.floor(min / 60)} h ago`;
  const d = Math.floor(min / 1440);
  return d < 60 ? `${d} d ago` : `${Math.floor(d / 30)} mo ago`;
}

const TZ = "Asia/Colombo";
const dayMonth = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" });
const dayMonthYear = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
const clock = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });

/** "24 Nov · 9:15 AM" */
export const stamp = (iso: string) => `${dayMonth.format(new Date(iso))} · ${clock.format(new Date(iso))}`;
/** "24 Nov 2026, 9:15 AM" */
const fullStamp = (iso: string) => `${dayMonthYear.format(new Date(iso))}, ${clock.format(new Date(iso))}`;

/** "08:00:00" + 12 h → "8:00 PM"; past midnight adds "(next day)". */
function endTime(start: string, hours: number) {
  const [h, m] = start.split(":").map(Number);
  const total = h * 60 + m + hours * 60;
  const t = total % 1440;
  const days = Math.floor(total / 1440);
  return `${niceTime(`${Math.floor(t / 60)}:${t % 60}`)}${days ? (days === 1 ? " (next day)" : ` (+${days} days)`) : ""}`;
}

const cap = (s?: string | null) => (s ? s[0].toUpperCase() + s.slice(1) : "");

// ======================================================================= styles
const EVENT_STYLE: Record<EventKey, { icon: LucideIcon; cls: string }> = {
  created: { icon: CalendarPlus, cls: "bg-indigo-100 text-indigo-600" },
  confirmed: { icon: PhoneCall, cls: "bg-emerald-100 text-emerald-600" },
  ignored: { icon: XCircle, cls: "bg-rose-100 text-rose-600" },
  assigned: { icon: UserCheck, cls: "bg-violet-100 text-violet-600" },
  reassigned: { icon: Repeat, cls: "bg-violet-100 text-violet-600" },
  unassigned: { icon: UserMinus, cls: "bg-amber-100 text-amber-700" },
  delivered: { icon: PackageCheck, cls: "bg-teal-100 text-teal-600" },
  invoice_printed: { icon: Printer, cls: "bg-slate-200/80 text-slate-600" },
};

const ACCENT_GRADIENT = "bg-gradient-to-br from-[#6658f5] to-[#8b5cf6]";

type Variant = "panel" | "page";

type Stop = {
  key: string;
  label: string;
  state: MilestoneState | "ignored";
  at: string | null;
  byUser: string | null;
  sincePrevious: number | null;
  note?: string | null;
};

/** The 5 milestones, plus the red Ignored stop right after the last done one. */
function buildStops(j: BookingJourney): Stop[] {
  const stops: Stop[] = j.milestones.map((m) => ({ ...m }));
  if (j.ignored) {
    let lastDone = -1;
    stops.forEach((s, i) => s.state === "done" && (lastDone = i));
    const prevAt = lastDone >= 0 ? stops[lastDone].at : null;
    stops.splice(lastDone + 1, 0, {
      key: "ignored",
      label: "Ignored",
      state: "ignored",
      at: j.ignored.at,
      byUser: j.ignored.byUser,
      sincePrevious: prevAt ? Math.max(0, Math.round((Date.parse(j.ignored.at) - Date.parse(prevAt)) / 60_000)) : null,
      note: j.ignored.note,
    });
  }
  return stops;
}

const stepStyle = (i: number): CSSProperties => ({ animationDelay: `${i * 90}ms` });

// ======================================================================= the component
export function BookingJourney({
  journey: j,
  variant,
  actions,
  canViewCustomer = false,
  canViewInvoice = true,
  extras,
}: {
  journey: BookingJourney;
  variant: Variant;
  /** Page: the action buttons (Edit, Confirm, …), shown in the header. */
  actions?: ReactNode;
  canViewCustomer?: boolean;
  canViewInvoice?: boolean;
  /** Page: details that aren't part of the journey itself. */
  extras?: { customerAltPhone?: string | null; customerAddress?: string | null; careNotes?: string | null; employeePhone?: string | null };
}) {
  const stops = buildStops(j);
  const now = Date.parse(j.asOf);
  const page = variant === "page";

  const timeline = <Timeline events={j.events} invoice={j.invoice} canViewInvoice={canViewInvoice} now={now} compact={!page} />;

  return (
    <div className={page ? "space-y-5" : "space-y-4"}>
      <Header j={j} variant={variant} actions={actions} />

      {/* B. Milestone track */}
      <Card className={page ? "px-4 py-6 sm:px-6" : "px-4 py-5"}>
        {page ? (
          <>
            <div className="hidden md:block">
              <HorizontalTrack stops={stops} />
            </div>
            <div className="md:hidden">
              <VerticalTrack stops={stops} size="lg" />
            </div>
          </>
        ) : (
          <VerticalTrack stops={stops} size="sm" />
        )}
      </Card>

      {/* C. Key numbers */}
      {page ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Time to confirm" value={j.stats.toConfirm} />
          <StatTile label="Time to assign" value={j.stats.toAssign} />
          <StatTile label="Time to deliver" value={j.stats.toDeliver} />
          <StatTile label="Booking → delivery" value={j.stats.bookingToDelivery} strong />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="To confirm" value={j.stats.toConfirm} compact />
          <StatTile label="To assign" value={j.stats.toAssign} compact />
          <StatTile label="To deliver" value={j.stats.toDeliver} compact />
          <StatTile label="Booking → delivery" value={j.stats.bookingToDelivery} compact strong />
        </div>
      )}

      {page ? (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Timeline" subtitle="Every step, including detours" />
            <div className="px-5 pb-5">{timeline}</div>
          </Card>
          <SideCards j={j} canViewCustomer={canViewCustomer} canViewInvoice={canViewInvoice} extras={extras} />
        </div>
      ) : (
        <div>
          <h3 className="mb-3 text-[13px] font-semibold text-ink">Timeline</h3>
          {timeline}
        </div>
      )}
    </div>
  );
}

// ======================================================================= A. header
function Header({ j, variant, actions }: { j: BookingJourney; variant: Variant; actions?: ReactNode }) {
  const b = j.booking;
  const page = variant === "page";
  const body = (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className={cn("font-semibold tracking-tight text-ink", page ? "text-2xl sm:text-3xl" : "text-xl")}>{b.bookingNo}</h1>
          <StatusBadge status={b.status} />
        </div>
        <p className="text-sm text-ink/90">
          <span className="font-medium">{j.customer.fullName}</span>
          <span className="mx-1.5 text-muted">→</span>
          <span className="font-medium">{j.patient.fullName}</span>{" "}
          <span className="text-muted">({relationshipLabel(j.patient.relationship, j.patient.relationshipOther)})</span>
        </p>
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
          <CalendarClock size={14} className="text-accent" />
          {niceDate(b.serviceDate)} · {niceTime(b.startTime)} – {endTime(b.startTime, b.durationHours)} · {b.durationHours} h
        </p>
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
          <FileText size={14} className="text-accent" />
          {b.packageName ?? "Package"} · <span className="font-medium text-ink/90">{money(b.rate)}</span>
        </p>
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
  return page ? <Card strong className="px-5 py-5">{body}</Card> : body;
}

// ======================================================================= B. milestone track
function Node({ s, size }: { s: Stop; size: "sm" | "lg" }) {
  const dim = size === "lg" ? "h-12 w-12" : "h-9 w-9";
  const icon = size === "lg" ? 20 : 16;
  if (s.state === "done")
    return (
      <span className={cn("relative z-10 flex shrink-0 items-center justify-center rounded-full text-white shadow-[0_8px_18px_-8px_rgba(102,88,245,0.8)]", dim, ACCENT_GRADIENT)}>
        <Check size={icon} strokeWidth={3} />
      </span>
    );
  if (s.state === "ignored")
    return (
      <span className={cn("relative z-10 flex shrink-0 items-center justify-center rounded-full bg-rose-500 text-white shadow-[0_8px_18px_-8px_rgba(244,63,94,0.8)]", dim)}>
        <X size={icon} strokeWidth={3} />
      </span>
    );
  if (s.state === "current")
    return (
      <span className={cn("relative z-10 flex shrink-0 items-center justify-center", dim)}>
        <span className="absolute inset-0 animate-ping rounded-full bg-accent/25 motion-reduce:animate-none" />
        <span className="relative flex h-full w-full items-center justify-center rounded-full border-2 border-accent bg-white text-accent">
          <CircleDot size={icon} />
        </span>
      </span>
    );
  if (s.state === "skipped")
    return (
      <span className={cn("relative z-10 flex shrink-0 items-center justify-center rounded-full border-2 border-dashed border-slate-300 bg-white/60 text-slate-300 opacity-60", dim)}>
        <Minus size={icon} />
      </span>
    );
  return <span className={cn("relative z-10 flex shrink-0 items-center justify-center rounded-full border-2 border-slate-200 bg-white/80 text-slate-300", dim)}><CircleDot size={icon - 4} /></span>;
}

function StopText({ s, center }: { s: Stop; center?: boolean }) {
  return (
    <div className={cn("min-w-0", center && "text-center")}>
      <div
        className={cn(
          "text-sm font-semibold",
          s.state === "done" && "text-ink",
          s.state === "ignored" && "text-rose-700",
          s.state === "current" && "text-accent",
          s.state === "upcoming" && "text-muted",
          s.state === "skipped" && "text-slate-400 line-through",
        )}
      >
        {s.label}
      </div>
      {s.at ? (
        <>
          <div className="text-xs text-ink/75">{stamp(s.at)}</div>
          {s.byUser && <div className="text-xs text-muted">by {s.byUser}</div>}
        </>
      ) : (
        <div className="text-xs text-muted">{s.state === "current" ? "Waiting" : s.state === "skipped" ? "Skipped" : "Not yet"}</div>
      )}
      {s.state === "ignored" && s.note && (
        <div className={cn("mt-1.5 rounded-lg border border-rose-100 bg-rose-50/90 px-2 py-1 text-xs text-rose-700", center && "mx-auto max-w-[180px]")}>{s.note}</div>
      )}
    </div>
  );
}

/** The line from stop `a` to the next stop `b`. */
function lineClass(b: Stop, vertical: boolean) {
  const solid = vertical ? "w-0.5" : "h-0.5";
  const dashed = vertical ? "border-l-2" : "border-t-2";
  if (b.state === "done") return cn(solid, "bg-gradient-to-r from-[#6658f5] to-[#8b5cf6]");
  if (b.state === "ignored") return cn(solid, "bg-rose-300");
  if (b.state === "current") return cn(dashed, "border-dashed border-accent/50");
  if (b.state === "skipped") return cn(dashed, "border-dotted border-slate-300 opacity-60");
  return cn(dashed, "border-dashed border-slate-200");
}

function DurationPill({ s }: { s: Stop }) {
  if (s.sincePrevious === null || (s.state !== "done" && s.state !== "ignored")) return null;
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold shadow-sm",
        s.state === "ignored" ? "border-rose-100 bg-rose-50 text-rose-700" : "border-white bg-white text-accent",
      )}
    >
      +{formatDuration(s.sincePrevious)}
    </span>
  );
}

function HorizontalTrack({ stops }: { stops: Stop[] }) {
  return (
    <ol className="flex">
      {stops.map((s, i) => {
        const next = stops[i + 1];
        return (
          <li key={s.key} className="journey-step relative flex flex-1 flex-col items-center gap-2 px-1" style={stepStyle(i)}>
            {next && (
              // From this node's centre to the next one's, leaving a gap around both nodes.
              <span className="absolute top-6 right-[calc(-50%+30px)] left-[calc(50%+30px)] flex -translate-y-1/2 items-center justify-center">
                <span className={cn("w-full", lineClass(next, false))} />
                <span className="absolute">
                  <DurationPill s={next} />
                </span>
              </span>
            )}
            <Node s={s} size="lg" />
            <StopText s={s} center />
          </li>
        );
      })}
    </ol>
  );
}

function VerticalTrack({ stops, size }: { stops: Stop[]; size: "sm" | "lg" }) {
  const left = size === "lg" ? "left-[23px] top-12" : "left-[17px] top-9";
  return (
    <ol>
      {stops.map((s, i) => {
        const next = stops[i + 1];
        return (
          <li key={s.key} className="journey-step relative flex gap-3 pb-5 last:pb-0" style={stepStyle(i)}>
            {next && <span className={cn("absolute bottom-0", left, lineClass(next, true))} />}
            <Node s={s} size={size} />
            <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-2 pt-1">
              <StopText s={s} />
              <DurationPill s={s} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ======================================================================= C. stat tiles
function StatTile({ label, value, strong, compact }: { label: string; value: number | null; strong?: boolean; compact?: boolean }) {
  return (
    <div className={cn("glass break-inside-avoid", compact ? "px-3 py-2" : "px-4 py-3")}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className={cn("mt-0.5 font-semibold", compact ? "text-base" : "text-xl", value === null ? "text-muted" : strong ? "text-accent" : "text-ink")}>
        {formatDuration(value)}
      </div>
    </div>
  );
}

// ======================================================================= D. timeline
const empLine = (e: JourneyEmployee) => [e.name, e.empNo, e.branchName].filter(Boolean).join(" · ");

function Timeline({
  events,
  invoice,
  canViewInvoice,
  now,
  compact,
}: {
  events: JourneyEvent[];
  invoice: BookingJourney["invoice"];
  canViewInvoice: boolean;
  now: number;
  compact: boolean;
}) {
  if (events.length === 0) return <p className="text-sm text-muted">No history recorded.</p>;
  return (
    <ol>
      {events.map((e, i) => {
        const style = e.kind ? EVENT_STYLE[e.kind] : { icon: CircleDot, cls: "bg-slate-100 text-slate-500" };
        const Icon = style.icon;
        return (
          <li key={e.id} className="relative pb-5 pl-12 last:pb-0">
            {i < events.length - 1 && <span className="absolute top-10 bottom-1 left-[17px] w-px bg-indigo-100" />}
            <span className={cn("absolute top-0 left-0 flex h-9 w-9 items-center justify-center rounded-full ring-4 ring-white/70", style.cls)}>
              <Icon size={16} />
            </span>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 pt-0.5">
              <span className="text-sm font-semibold text-ink">{e.label}</span>
              <span className="text-xs text-muted" title={fullStamp(e.at)}>
                {compact ? stamp(e.at) : fullStamp(e.at)} · {timeAgo(e.at, now)}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-ink/80">
              <Avatar name={e.byUser} size="sm" />
              <span>{e.byUser}</span>
            </div>

            {(e.kind === "assigned" || e.kind === "reassigned") && (
              <div className="mt-2 rounded-lg bg-violet-50/80 px-2.5 py-1.5 text-xs text-violet-900">
                {e.kind === "reassigned" ? (
                  <>
                    <span className="text-violet-700/80">from</span> {e.previousEmployee ? empLine(e.previousEmployee) : "employee not recorded"}{" "}
                    <span className="text-violet-700/80">→ to</span> {e.employee ? empLine(e.employee) : "employee not recorded"}
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <UserRound size={12} /> {e.employee ? empLine(e.employee) : "Employee not recorded"}
                  </span>
                )}
              </div>
            )}
            {e.kind === "unassigned" && (
              <div className="mt-2 rounded-lg bg-amber-50/80 px-2.5 py-1.5 text-xs text-amber-900">
                Removed: {e.employee ? empLine(e.employee) : "employee not recorded"}
              </div>
            )}
            {e.kind === "delivered" && invoice && (
              <div className="mt-2 text-xs">
                {canViewInvoice ? (
                  <Link href={`/invoices/${invoice.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-50/80 px-2.5 py-1.5 font-medium text-teal-800 hover:bg-teal-100/80">
                    <FileText size={12} /> {invoiceLine(invoice)}
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-teal-50/80 px-2.5 py-1.5 text-teal-800">
                    <FileText size={12} /> {invoiceLine(invoice)}
                  </span>
                )}
              </div>
            )}
            {e.note && <div className="mt-2 rounded-lg bg-white/60 px-2.5 py-1.5 text-xs text-muted">{e.note}</div>}
          </li>
        );
      })}
    </ol>
  );
}

function invoiceLine(inv: NonNullable<BookingJourney["invoice"]>) {
  return `${inv.invoiceNo} · ${money(inv.amount)} · ${inv.printCount ? `printed ${inv.printCount}×` : "not printed yet"}`;
}

// ======================================================================= E. side cards (page)
function SideCards({
  j,
  canViewCustomer,
  canViewInvoice,
  extras,
}: {
  j: BookingJourney;
  canViewCustomer: boolean;
  canViewInvoice: boolean;
  extras?: { customerAltPhone?: string | null; customerAddress?: string | null; careNotes?: string | null; employeePhone?: string | null };
}) {
  const b = j.booking;
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Customer"
          action={canViewCustomer && <Link href={`/customers/${j.customer.id}`} className="text-xs font-medium text-accent hover:underline">Profile</Link>}
        />
        <div className="space-y-2 px-5 pb-5 text-sm">
          <Person name={j.customer.fullName} sub={j.customer.customerNo} />
          <Info icon={<Phone size={14} />}>
            <a href={`tel:${j.customer.phone}`} className="hover:text-accent">{j.customer.phone}</a>
            {extras?.customerAltPhone && ` / ${extras.customerAltPhone}`}
          </Info>
          {extras?.customerAddress && <Info icon={<Home size={14} />}>{extras.customerAddress}</Info>}
        </div>
      </Card>

      <Card>
        <CardHeader title="Patient" />
        <div className="space-y-2 px-5 pb-5 text-sm">
          <Person
            name={j.patient.fullName}
            sub={`${j.patient.patientNo} · ${relationshipLabel(j.patient.relationship, j.patient.relationshipOther)} · ${cap(j.patient.gender)}`}
          />
          {extras?.careNotes && <Info icon={<StickyNote size={14} />}>{extras.careNotes}</Info>}
        </div>
      </Card>

      <Card>
        <CardHeader title="Location" />
        <div className="space-y-2 px-5 pb-5 text-sm">
          <Info icon={b.locationType === "hospital" ? <Hospital size={14} /> : <Home size={14} />} label={b.locationType === "hospital" ? "Hospital" : "Home care"}>
            {b.locationType === "hospital" ? hospitalPlace(b.hospitalName, b.wardNo, b.bedNo, ", ") : (b.serviceAddress ?? "—")}
          </Info>
          {b.notes && <Info icon={<StickyNote size={14} />} label="Notes">{b.notes}</Info>}
        </div>
      </Card>

      <Card>
        <CardHeader title="Assigned employee" />
        <div className="px-5 pb-5 text-sm">
          {j.assignment ? (
            <div className="space-y-2">
              <Person name={j.assignment.employeeName} sub={`${j.assignment.empNo} · ${j.assignment.designation}`} />
              {j.assignment.branchName && <Info icon={<UserRound size={14} />}>{j.assignment.branchName} branch</Info>}
              {extras?.employeePhone && (
                <Info icon={<Phone size={14} />}>
                  <a href={`tel:${extras.employeePhone}`} className="hover:text-accent">{extras.employeePhone}</a>
                </Info>
              )}
            </div>
          ) : (
            <p className="text-muted">{b.status === "ignored" ? "No one — the booking was ignored." : "Not assigned yet."}</p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Invoice"
          action={j.invoice && canViewInvoice && <Link href={`/invoices/${j.invoice.id}`} className="text-xs font-medium text-accent hover:underline">Open</Link>}
        />
        <div className="px-5 pb-5 text-sm">
          {j.invoice ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{j.invoice.invoiceNo}</span>
                <StatusBadge status={j.invoice.status} />
              </div>
              <div className="text-lg font-semibold text-ink">{money(j.invoice.amount)}</div>
              <div className="text-xs text-muted">
                {j.invoice.printCount ? `Printed ${j.invoice.printCount}×` : "Not printed yet"}
                {j.invoice.printedAt && ` · marked printed ${stamp(j.invoice.printedAt)}`}
              </div>
            </div>
          ) : (
            <p className="text-muted">Created automatically when the session is delivered.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function Person({ name, sub }: { name: string; sub: string }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar name={name} />
      <div className="min-w-0">
        <div className="font-medium">{name}</div>
        <div className="text-xs text-muted">{sub}</div>
      </div>
    </div>
  );
}

function Info({ icon, label, children }: { icon: ReactNode; label?: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-accent">{icon}</span>
      <div className="min-w-0">
        {label && <div className="text-xs text-muted">{label}</div>}
        <div className="text-ink/90">{children}</div>
      </div>
    </div>
  );
}

// ======================================================================= loading skeleton (panel)
export function BookingJourneySkeleton() {
  return (
    <div className="animate-pulse space-y-4 motion-reduce:animate-none" aria-hidden>
      <div className="h-7 w-48 rounded-lg bg-white/70" />
      <div className="h-4 w-64 rounded bg-white/60" />
      <div className="h-4 w-40 rounded bg-white/60" />
      <div className="glass space-y-5 px-4 py-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-white/80" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-24 rounded bg-white/80" />
              <div className="h-3 w-32 rounded bg-white/60" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-2xl bg-white/60" />
        ))}
      </div>
    </div>
  );
}
