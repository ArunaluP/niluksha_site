import { ArrowRight, CalendarPlus, Clock, FileText, Home, Hospital, PhoneCall, Sparkles, UserCheck, Users } from "lucide-react";
import Link from "next/link";
import { Avatar, Card, CardHeader, cn, LinkButton, money, niceDate, niceDateTime, niceTime, Pill, STATUS_DOT, StatusBadge } from "@/components/ui";
import { getDashboardScreen } from "@/features/dashboard/service";
import { requireUser } from "@/lib/dal";
import { hasPermission, ROLE_LABELS } from "@/lib/permissions";

export const metadata = { title: "Dashboard · Care Booking" };

const MIX = [
  { key: "pending", label: "Pending", color: "#f5b544" },
  { key: "confirmed", label: "Confirmed", color: "#38bdf8" },
  { key: "assigned", label: "Assigned", color: "#8b5cf6" },
  { key: "delivered", label: "Delivered", color: "#10b981" },
  { key: "invoice_printed", label: "Invoiced", color: "#94a3b8" },
  { key: "ignored", label: "Ignored", color: "#fb7185" },
] as const;

export default async function DashboardPage() {
  const user = await requireUser();
  const d = await getDashboardScreen(user);
  const s = d.summary.bookingsByStatus;
  const canWork = hasPermission(user, "useCallList");

  // "Today's distribution" tiles (like the sample's Report Distribution block)
  const tiles = [
    { label: "Pending calls", value: s.pending, cls: "from-[#6658f5] to-[#7c6cf8]", href: "/call-list" },
    { label: "Confirmed", value: s.confirmed, cls: "from-[#3b82f6] to-[#60a5fa]", href: "/assignments" },
    { label: "Assigned", value: s.assigned, cls: "from-[#10b981] to-[#34d399]", href: "/bookings?status=assigned" },
    { label: "Delivered", value: s.delivered + s.invoice_printed, cls: "from-[#f59e0b] to-[#fbbf24]", href: "/bookings?status=delivered,invoice_printed" },
  ];
  const active = d.summary.totalBookings - s.ignored;
  const maxWeek = Math.max(1, ...d.week.map((w) => w.total));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Good day, {user.name.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-muted">
            {niceDate(d.date)} · {ROLE_LABELS[user.role]} overview
          </p>
        </div>
        <div className="flex gap-2">
          {canWork && (
            <>
              <LinkButton href="/call-list" variant="secondary">
                <PhoneCall size={16} /> Call list
              </LinkButton>
              <LinkButton href="/bookings/new">
                <CalendarPlus size={16} /> New booking
              </LinkButton>
            </>
          )}
        </div>
      </div>

      {/* Row 1 */}
      <div className="grid gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader title="Today's bookings" subtitle={`${active} active · ${s.ignored} ignored`} />
          <div className="grid h-[150px] grid-cols-4 grid-rows-2 gap-2 px-5 pb-5">
            {tiles.map((t, i) => (
              <Link
                key={t.label}
                href={t.href}
                className={cn(
                  "flex flex-col justify-end rounded-xl bg-gradient-to-br p-3 text-white shadow-sm transition hover:brightness-110",
                  t.cls,
                  i === 0 ? "col-span-2 row-span-2" : i === 1 ? "col-span-2" : "col-span-1",
                )}
              >
                <span className={cn("font-semibold leading-none", i === 0 ? "text-4xl" : "text-xl")}>{t.value}</span>
                <span className="mt-1 text-[11px] font-medium text-white/90">{t.label}</span>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="p-5 lg:col-span-3">
          <div className="text-[15px] font-semibold">Next 7 days</div>
          <div className="mt-2 flex items-end justify-between">
            <div className="text-3xl font-semibold">{d.week.reduce((a, w) => a + w.total, 0)}</div>
            <div className="flex h-12 items-end gap-1">
              {d.week.map((w) => (
                <div key={w.date} title={`${w.date}: ${w.total}`} className="w-2.5 rounded-sm bg-gradient-to-t from-[#6658f5] to-[#a78bfa]" style={{ height: `${Math.max(8, (w.total / maxWeek) * 100)}%` }} />
              ))}
            </div>
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <Row label="Waiting for a call" value={d.week.reduce((a, w) => a + w.pending, 0)} />
            <Row label="Need an employee" value={d.week.reduce((a, w) => a + w.confirmed, 0)} />
            <Row label="Assigned" value={d.week.reduce((a, w) => a + w.assigned, 0)} />
          </div>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <div className="text-[15px] font-semibold">Free today</div>
          <div className="mt-2 text-3xl font-semibold">{d.freeToday}</div>
          <div className="text-xs text-muted">caregivers &amp; nurses</div>
          <div className="mt-3 space-y-1.5">
            {d.freeByBranch.slice(0, 3).map((b) => (
              <div key={b.branch} className="flex justify-between text-xs">
                <span className="truncate text-muted">{b.branch}</span>
                <span className="font-semibold">{b.count}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <div className="text-[15px] font-semibold">Invoices</div>
          <div className="mt-2 text-3xl font-semibold">{d.summary.invoicesWaitingToPrint.count}</div>
          <div className="text-xs text-muted">waiting to print</div>
          <div className="mt-3 text-xs text-muted">Value</div>
          <div className="text-sm font-semibold">{money(d.summary.invoicesWaitingToPrint.amount)}</div>
          <Link href="/invoices?status=generated" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
            Open <ArrowRight size={12} />
          </Link>
        </Card>
      </div>

      {/* Row 2 */}
      <div className="grid gap-5 lg:grid-cols-12 lg:items-start">
        <Card className="lg:col-span-5">
          <CardHeader
            title="Today's schedule"
            subtitle="Sessions starting today"
            action={
              <Link href={`/bookings?date=${d.date}`} className="rounded-lg bg-white/70 px-2.5 py-1 text-[11px] font-medium text-muted hover:text-ink">
                View all
              </Link>
            }
          />
          <div className="space-y-2 px-5 pb-5">
            {d.schedule.length === 0 && <p className="py-6 text-center text-sm text-muted">No sessions today.</p>}
            {d.schedule.map((b) => (
              <Link key={b.id} href={`/bookings/${b.id}`} className="flex items-center gap-3 rounded-xl bg-white/55 p-3 transition hover:bg-white/80">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  {b.locationType === "hospital" ? <Hospital size={18} /> : <Home size={18} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{b.patientName}</div>
                  <div className="truncate text-xs text-muted">
                    {b.customerName} · {b.employeeName ?? "No employee yet"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="mb-1 flex items-center justify-end gap-1 text-xs text-muted">
                    <Clock size={12} /> {niceTime(b.startTime)}
                  </div>
                  <StatusBadge status={b.status} />
                </div>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader title="7-day outlook" subtitle="Bookings by status per day" />
          <div className="px-5 pb-5">
            <div className="grid grid-cols-[84px_repeat(7,1fr)] gap-1.5 text-[11px]">
              <div />
              {d.week.map((w) => (
                <div key={w.date} className="text-center font-medium text-muted">
                  {new Date(`${w.date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}
                </div>
              ))}
              {(["pending", "confirmed", "assigned", "delivered"] as const).map((st) => (
                <Heat key={st} label={MIX.find((m) => m.key === st)!.label} values={d.week.map((w) => w[st])} />
              ))}
              <div className="flex items-center pt-1 font-semibold text-ink">Total</div>
              {d.week.map((w) => (
                <div key={w.date} className="pt-1 text-center font-semibold">
                  {w.total}
                </div>
              ))}
            </div>
          </div>
        </Card>

        <div className="relative overflow-hidden rounded-[1.25rem] border border-white/80 bg-gradient-to-br from-[#e9e6ff]/90 via-[#efeaff]/80 to-[#dfe7ff]/80 p-5 shadow-[0_10px_30px_-12px_rgba(76,81,191,0.25)] backdrop-blur-xl lg:col-span-3">
          <div className="flex items-center gap-2 text-[15px] font-semibold">
            <Sparkles size={16} className="text-accent" /> Quick actions
          </div>
          <p className="mt-1 text-xs text-muted">The daily flow, one click away.</p>
          <div className="mt-4 space-y-2">
            {canWork ? (
              <>
                <QuickLink href="/bookings/new" icon={<CalendarPlus size={16} />} label="Record a new booking" />
                <QuickLink href="/call-list" icon={<PhoneCall size={16} />} label={`Call customers (${s.pending})`} />
                <QuickLink href="/assignments" icon={<UserCheck size={16} />} label={`Assign employees (${s.confirmed})`} />
                <QuickLink href="/invoices?status=generated" icon={<FileText size={16} />} label="Print invoices" />
              </>
            ) : (
              <>
                <QuickLink href="/bookings" icon={<FileText size={16} />} label="Branch bookings" />
                <QuickLink href="/employees" icon={<Users size={16} />} label="Branch employees" />
                <QuickLink href="/invoices" icon={<FileText size={16} />} label="Branch invoices" />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Row 3 */}
      <div className="grid gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader title="Recent activity" subtitle="Latest status changes" />
          <div className="divide-y divide-indigo-100/60 px-5 pb-4">
            {d.activity.length === 0 && <p className="py-6 text-center text-sm text-muted">No activity yet.</p>}
            {d.activity.map((a) => (
              <Link key={a.id} href={`/bookings/${a.bookingId}`} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                <Avatar name={a.userName} size="sm" />
                <div className="min-w-0 flex-1 text-sm">
                  <span className="font-medium">{a.userName}</span> <span className="text-muted">set</span>{" "}
                  <span className="font-medium">{a.bookingNo}</span> <span className="text-muted">to</span> <StatusBadge status={a.toStatus} />
                </div>
                <Pill>{niceDateTime(a.createdAt)}</Pill>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader title="This month" subtitle="Booking status mix" />
          <div className="flex items-center gap-6 px-5 pb-5">
            <Donut values={MIX.map((m) => ({ value: d.monthMix[m.key] ?? 0, color: m.color }))} />
            <div className="flex-1 space-y-2">
              {MIX.map((m) => (
                <div key={m.key} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 rounded-full", STATUS_DOT[m.key])} />
                    {m.label}
                  </span>
                  <span className="font-semibold">{d.monthMix[m.key] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl bg-white/65 px-3 py-2.5 text-sm font-medium transition hover:bg-white">
      <span className="text-accent">{icon}</span>
      <span className="flex-1">{label}</span>
      <ArrowRight size={14} className="text-muted" />
    </Link>
  );
}

function Heat({ label, values }: { label: string; values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <>
      <div className="flex items-center text-muted">{label}</div>
      {values.map((v, i) => (
        <div
          key={i}
          title={`${v}`}
          className="flex h-8 items-center justify-center rounded-md text-[11px] font-semibold"
          style={{
            background: v ? `rgba(102, 88, 245, ${0.15 + (v / max) * 0.6})` : "rgba(255,255,255,0.55)",
            color: v / max > 0.5 ? "#fff" : "#4b4a7a",
          }}
        >
          {v || ""}
        </div>
      ))}
    </>
  );
}

/** Simple SVG donut. */
function Donut({ values }: { values: { value: number; color: string }[] }) {
  const total = values.reduce((a, v) => a + v.value, 0);
  const r = 52;
  const c = 2 * Math.PI * r;
  const segments = values.reduce<{ len: number; offset: number; color: string }[]>((acc, v) => {
    const prev = acc.at(-1);
    const offset = prev ? prev.offset + prev.len : 0;
    acc.push({ len: total ? (v.value / total) * c : 0, offset, color: v.color });
    return acc;
  }, []);
  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="16" />
        {segments.map((sg, i) => (sg.len ? <circle key={i} cx="70" cy="70" r={r} fill="none" stroke={sg.color} strokeWidth="16" strokeDasharray={`${sg.len} ${c - sg.len}`} strokeDashoffset={-sg.offset} /> : null))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold">{total}</span>
        <span className="text-[11px] text-muted">bookings</span>
      </div>
    </div>
  );
}
