import { CalendarDays, Home, Hospital, Phone, PhoneCall } from "lucide-react";
import { hospitalPlace } from "@/lib/lk-rules";
import Link from "next/link";
import * as z from "zod";
import { AssignButton, ConfirmButton, IgnoreButton } from "@/components/app/booking-actions";
import { Avatar, Card, cn, EmptyState, LinkButton, niceDate, niceTime, PageHeader, STATUS_DOT, StatusBadge, Table, Td, Th } from "@/components/ui";
import { getCallList } from "@/features/bookings/service";
import { requirePermission } from "@/lib/dal";
import { addDays, today } from "@/lib/dates";
import { isoDate } from "@/lib/validation";

export const metadata = { title: "Call list · Care Booking" };

const Query = z.object({
  date: isoDate.optional().catch(undefined),
  view: z.enum(["pending", "done", "all"]).catch("pending").default("pending"),
});

const STATUS_ROWS = [
  ["pending", "To call"],
  ["confirmed", "Confirmed"],
  ["assigned", "Assigned"],
  ["delivered", "Delivered"],
  ["invoice_printed", "Invoiced"],
  ["ignored", "Ignored"],
] as const;

export default async function CallListPage({ searchParams }: PageProps<"/call-list">) {
  await requirePermission("useCallList");
  const q = Query.parse(await searchParams);
  const t = today();
  const tm = addDays(t, 1);
  const date = q.date ?? t;

  const [list, todayList, tomorrowList] = await Promise.all([
    getCallList({ date, view: q.view }),
    getCallList({ date: t, view: "pending" }),
    getCallList({ date: tm, view: "pending" }),
  ]);
  const c = list.counts;
  const doneCount = Object.entries(c).reduce((a, [k, v]) => (k === "pending" ? a : a + v), 0);
  const href = (p: { date?: string; view?: string }) => `/call-list?date=${p.date ?? date}&view=${p.view ?? q.view}`;

  return (
    <div>
      <PageHeader
        title="Call list"
        subtitle={`Call each customer to confirm or ignore their session · ${niceDate(date)}`}
        actions={
          <LinkButton href="/bookings/new">
            <CalendarDays size={16} /> New booking
          </LinkButton>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[250px_1fr] lg:items-start">
        {/* Left panel: views + overview */}
        <div className="space-y-5">
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
              <PhoneCall size={13} /> Days
            </div>
            <ViewLink href={href({ date: t, view: "pending" })} active={date === t} label="Today" count={todayList.counts.pending} />
            <ViewLink href={href({ date: tm, view: "pending" })} active={date === tm} label="Tomorrow" count={tomorrowList.counts.pending} />
            <form action="/call-list" className="mt-3 space-y-2 px-1">
              <input type="hidden" name="view" value={q.view} />
              <label className="text-xs text-muted">Other date</label>
              <div className="flex gap-2">
                <input type="date" name="date" defaultValue={date} className="field py-1.5" />
                <button className="rounded-xl bg-white/80 px-3 text-xs font-medium text-ink hover:bg-white">Go</button>
              </div>
            </form>
          </Card>

          <Card className="p-4">
            <div className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Quick overview</div>
            <div className="space-y-1.5">
              {STATUS_ROWS.map(([k, label]) => (
                <div key={k} className="flex items-center justify-between rounded-xl bg-white/55 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[k])} />
                    {label}
                  </span>
                  <span className="font-semibold">{c[k]}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-xl bg-accent-soft/70 px-3 py-2.5 text-xs text-ink/80">
              {c.pending === 0 ? "All customers for this day have been called." : `${c.pending} customer${c.pending === 1 ? "" : "s"} still to call.`}
            </div>
          </Card>
        </div>

        {/* Table */}
        <Card strong className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-indigo-100/60 px-4 py-3">
            {(
              [
                ["pending", `To call (${c.pending})`],
                ["done", `Done (${doneCount})`],
                ["all", "All"],
              ] as const
            ).map(([v, label]) => (
              <Link
                key={v}
                href={href({ view: v })}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                  q.view === v ? "bg-accent text-white shadow-sm" : "text-muted hover:bg-white/70 hover:text-ink",
                )}
              >
                {label}
              </Link>
            ))}
          </div>

          {list.items.length === 0 ? (
            <EmptyState
              icon={<PhoneCall size={22} />}
              title={q.view === "pending" ? "Nobody left to call" : "No bookings"}
              text={q.view === "pending" ? "Every booking for this day has been confirmed or ignored." : "There are no bookings in this view."}
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Time</Th>
                  <Th>Customer</Th>
                  <Th>Patient</Th>
                  <Th>Location</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Action</Th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((b) => (
                  <tr key={b.id} className="transition hover:bg-white/50">
                    <Td className="whitespace-nowrap">
                      <div className="font-semibold">{niceTime(b.startTime)}</div>
                      <Link href={`/bookings/${b.id}`} className="text-xs text-accent hover:underline">
                        {b.bookingNo}
                      </Link>
                    </Td>
                    <Td className="min-w-[210px]">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={b.customerName} size="sm" />
                        <div>
                          <div className="font-medium">{b.customerName}</div>
                          <a href={`tel:${b.customerPhone}`} className="inline-flex items-center gap-1 text-xs text-muted hover:text-accent">
                            <Phone size={11} /> {b.customerPhone}
                            {b.customerAltPhone ? ` / ${b.customerAltPhone}` : ""}
                          </a>
                        </div>
                      </div>
                    </Td>
                    <Td className="min-w-[150px]">{b.patientName}</Td>
                    <Td className="min-w-[190px] max-w-[260px]">
                      <div className="flex items-start gap-1.5 text-xs">
                        {b.locationType === "hospital" ? <Hospital size={14} className="mt-0.5 shrink-0 text-accent" /> : <Home size={14} className="mt-0.5 shrink-0 text-accent" />}
                        <span className="line-clamp-2">
                          {b.locationType === "hospital" ? hospitalPlace(b.hospitalName, b.wardNo, b.bedNo) : b.serviceAddress}
                        </span>
                      </div>
                    </Td>
                    <Td>
                      <StatusBadge status={b.status} />
                      {b.employeeName && <div className="mt-1 text-xs text-muted">{b.employeeName}</div>}
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1.5">
                        {b.status === "pending" && (
                          <>
                            <ConfirmButton bookingId={b.id} />
                            <IgnoreButton bookingId={b.id} bookingNo={b.bookingNo} />
                          </>
                        )}
                        {b.status === "confirmed" && <AssignButton bookingId={b.id} bookingNo={b.bookingNo} serviceDate={b.serviceDate} />}
                        {b.status !== "pending" && b.status !== "confirmed" && (
                          <LinkButton href={`/bookings/${b.id}`} variant="ghost" size="sm">
                            View
                          </LinkButton>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}

function ViewLink({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      className={cn(
        "mb-1 flex items-center justify-between rounded-xl px-3 py-2 text-sm transition",
        active ? "bg-accent-soft/90 font-medium text-accent" : "text-ink/75 hover:bg-white/60",
      )}
    >
      {label}
      <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", active ? "bg-white/80 text-accent" : "bg-white/70 text-muted")}>{count}</span>
    </Link>
  );
}
