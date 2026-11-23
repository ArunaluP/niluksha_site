import { Home, Hospital, UserCheck } from "lucide-react";
import { hospitalPlace } from "@/lib/lk-rules";
import Link from "next/link";
import { Tabs } from "@/components/app/list-tools";
import { AssignButton } from "@/components/app/booking-actions";
import { Avatar, Card, EmptyState, niceDate, niceTime, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui";
import { ActionButton } from "@/components/ui/client";
import { listBookings } from "@/features/bookings/service";
import { requirePermission } from "@/lib/dal";
import { today } from "@/lib/dates";
import { unassignEmployeeAction } from "../_actions/bookings";

export const metadata = { title: "Assignments · Care Booking" };

type Row = {
  id: number;
  bookingNo: string;
  serviceDate: string;
  startTime: string;
  status: string;
  customerName: string;
  customerPhone: string;
  patientName: string;
  locationType: string;
  hospitalName: string | null;
  wardNo: string | null;
  bedNo: string | null;
  serviceAddress: string | null;
  employeeId: number | null;
  employeeName: string | null;
  branchName: string | null;
};

export default async function AssignmentsPage({ searchParams }: PageProps<"/assignments">) {
  const user = await requirePermission("assignEmployee");
  const view = (await searchParams).view === "assigned" ? "assigned" : "confirmed";
  const t = today();

  const [list, needCount] = await Promise.all([
    listBookings({ status: [view], from: t, page: 1, pageSize: 100 }, user),
    view === "assigned" ? listBookings({ status: ["confirmed"], from: t, page: 1, pageSize: 1 }, user).then((r) => r.total) : null,
  ]);
  const items = (list.items as Row[]).sort((a, b) => (a.serviceDate + a.startTime).localeCompare(b.serviceDate + b.startTime));
  const byDate = items.reduce<Record<string, Row[]>>((acc, r) => ((acc[r.serviceDate] ??= []).push(r), acc), {});
  const needs = needCount ?? list.total;

  return (
    <div>
      <PageHeader title="Assignments" subtitle="Give each confirmed booking a free caregiver or nurse, from any branch" />

      <Card strong>
        <div className="border-b border-indigo-100/60 px-4 py-3">
          <Tabs
            items={[
              { href: "/assignments", label: `Need an employee (${needs})`, active: view === "confirmed" },
              { href: "/assignments?view=assigned", label: "Assigned", active: view === "assigned" },
            ]}
          />
        </div>

        {items.length === 0 ? (
          <EmptyState
            icon={<UserCheck size={22} />}
            title={view === "confirmed" ? "Every confirmed booking has an employee" : "No upcoming assigned bookings"}
            text={view === "confirmed" ? "Confirm bookings on the call list and they will appear here." : undefined}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Time</Th>
                <Th>Patient &amp; customer</Th>
                <Th>Location</Th>
                <Th>{view === "assigned" ? "Employee" : "Status"}</Th>
                <Th className="text-right">Action</Th>
              </tr>
            </thead>
            {Object.entries(byDate).map(([date, rows]) => (
              <tbody key={date}>
                <tr>
                  <td colSpan={5} className="bg-white/40 px-4 py-2 text-xs font-semibold text-ink/80">
                    {date === t ? "Today" : niceDate(date)} · {rows.length} booking{rows.length === 1 ? "" : "s"}
                  </td>
                </tr>
                {rows.map((b) => (
                  <tr key={b.id} className="transition hover:bg-white/50">
                    <Td className="whitespace-nowrap">
                      <div className="font-semibold">{niceTime(b.startTime)}</div>
                      <Link href={`/bookings/${b.id}`} className="text-xs text-accent hover:underline">
                        {b.bookingNo}
                      </Link>
                    </Td>
                    <Td className="min-w-[220px]">
                      <div className="font-medium">{b.patientName}</div>
                      <div className="text-xs text-muted">
                        {b.customerName} · {b.customerPhone}
                      </div>
                    </Td>
                    <Td className="min-w-[200px] text-xs">
                      <div className="flex items-start gap-1.5">
                        {b.locationType === "hospital" ? <Hospital size={14} className="mt-0.5 text-accent" /> : <Home size={14} className="mt-0.5 text-accent" />}
                        {b.locationType === "hospital" ? hospitalPlace(b.hospitalName, b.wardNo, b.bedNo) : b.serviceAddress}
                      </div>
                    </Td>
                    <Td>
                      {view === "assigned" ? (
                        <div className="flex items-center gap-2">
                          <Avatar name={b.employeeName ?? "?"} size="sm" />
                          <div>
                            <div className="text-sm">{b.employeeName}</div>
                            <div className="text-xs text-muted">{b.branchName}</div>
                          </div>
                        </div>
                      ) : (
                        <StatusBadge status={b.status} />
                      )}
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1.5">
                        {view === "confirmed" ? (
                          <AssignButton bookingId={b.id} bookingNo={b.bookingNo} serviceDate={b.serviceDate} />
                        ) : (
                          <>
                            <AssignButton bookingId={b.id} bookingNo={b.bookingNo} serviceDate={b.serviceDate} currentEmployeeId={b.employeeId} variant="secondary" />
                            <ActionButton action={unassignEmployeeAction} input={{ id: b.id }} confirm={`Remove ${b.employeeName} from ${b.bookingNo}?`} success="Employee removed">
                              Unassign
                            </ActionButton>
                          </>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
