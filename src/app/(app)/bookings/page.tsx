import { CalendarPlus, ClipboardList, Search } from "lucide-react";
import Link from "next/link";
import { Pager, Tabs, withParams } from "@/components/app/list-tools";
import { Avatar, Button, Card, EmptyState, LinkButton, money, niceDate, niceTime, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui";
import { BookingListQuery, listBookings } from "@/features/bookings/service";
import { requirePermission } from "@/lib/dal";
import { hasPermission } from "@/lib/permissions";

export const metadata = { title: "Bookings · Care Booking" };

const TABS = [
  ["", "All"],
  ["pending", "Pending"],
  ["confirmed", "Confirmed"],
  ["assigned", "Assigned"],
  ["delivered,invoice_printed", "Delivered"],
  ["ignored", "Ignored"],
] as const;

type Row = {
  id: number;
  bookingNo: string;
  serviceDate: string;
  startTime: string;
  status: string;
  rate: string;
  customerName: string;
  customerPhone: string;
  patientName: string;
  employeeName: string | null;
  branchName: string | null;
  locationType: string;
  hospitalName: string | null;
};

export default async function BookingsPage({ searchParams }: PageProps<"/bookings">) {
  const user = await requirePermission("viewReports");
  const raw = Object.fromEntries(Object.entries(await searchParams).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const parsed = BookingListQuery.safeParse(raw);
  const q = parsed.success ? parsed.data : BookingListQuery.parse({});
  const data = await listBookings(q, user);
  const items = data.items as Row[];
  const statusKey = raw.status ?? "";

  return (
    <div>
      <PageHeader
        title="Bookings"
        subtitle={user.role === "branch_manager" ? "Bookings assigned to your branch" : "All care sessions, every status"}
        actions={
          hasPermission(user, "createBooking") && (
            <LinkButton href="/bookings/new">
              <CalendarPlus size={16} /> New booking
            </LinkButton>
          )
        }
      />

      <Card strong>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-100/60 px-4 py-3">
          <Tabs items={TABS.map(([v, label]) => ({ href: withParams("/bookings", raw, { status: v, page: undefined }), label, active: statusKey === v }))} />
          <form className="flex flex-wrap items-center gap-2" action="/bookings">
            {statusKey && <input type="hidden" name="status" value={statusKey} />}
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input name="q" defaultValue={raw.q} placeholder="Booking no, customer, phone, patient" className="field w-64 py-1.5 pl-8" />
            </div>
            <input type="date" name="from" defaultValue={raw.from} className="field w-auto py-1.5" title="From date" />
            <input type="date" name="to" defaultValue={raw.to} className="field w-auto py-1.5" title="To date" />
            <Button size="sm" variant="secondary">
              Filter
            </Button>
            {(raw.q || raw.from || raw.to || raw.date) && (
              <Link href={withParams("/bookings", { status: statusKey }, {})} className="text-xs text-accent hover:underline">
                Clear
              </Link>
            )}
          </form>
        </div>

        {items.length === 0 ? (
          <EmptyState icon={<ClipboardList size={22} />} title="No bookings found" text="Try another status, date range or search." />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Booking</Th>
                  <Th>Customer</Th>
                  <Th>Patient</Th>
                  <Th>Employee</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Rate</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((b) => (
                  <tr key={b.id} className="transition hover:bg-white/50">
                    <Td className="whitespace-nowrap">
                      <Link href={`/bookings/${b.id}`} className="font-semibold text-accent hover:underline">
                        {b.bookingNo}
                      </Link>
                      <div className="text-xs text-muted">
                        {niceDate(b.serviceDate)} · {niceTime(b.startTime)}
                      </div>
                    </Td>
                    <Td className="min-w-[200px]">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={b.customerName} size="sm" />
                        <div>
                          <div className="font-medium">{b.customerName}</div>
                          <div className="text-xs text-muted">{b.customerPhone}</div>
                        </div>
                      </div>
                    </Td>
                    <Td className="min-w-[160px]">
                      <div>{b.patientName}</div>
                      <div className="text-xs text-muted">{b.locationType === "hospital" ? b.hospitalName : "Home care"}</div>
                    </Td>
                    <Td className="min-w-[150px]">
                      {b.employeeName ? (
                        <>
                          <div>{b.employeeName}</div>
                          <div className="text-xs text-muted">{b.branchName}</div>
                        </>
                      ) : (
                        <span className="text-xs text-muted">Not assigned</span>
                      )}
                    </Td>
                    <Td>
                      <StatusBadge status={b.status} />
                    </Td>
                    <Td className="whitespace-nowrap text-right font-medium">{money(b.rate)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pager page={data.page} pageSize={data.pageSize} total={data.total} href={(p) => withParams("/bookings", raw, { page: p })} />
          </>
        )}
      </Card>
    </div>
  );
}
