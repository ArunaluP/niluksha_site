import { CalendarPlus, Search, Users } from "lucide-react";
import Link from "next/link";
import { Pager, withParams } from "@/components/app/list-tools";
import { Avatar, Button, Card, EmptyState, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";
import { CustomerListQuery, searchCustomers } from "@/features/customers/service";
import { requirePermission } from "@/lib/dal";

export const metadata = { title: "Customers · Care Booking" };

type Row = { id: number; customerNo: string; fullName: string; nic: string | null; phone: string; altPhone: string | null; city: string | null; patientCount: number };

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  await requirePermission("manageCustomers");
  const raw = Object.fromEntries(Object.entries(await searchParams).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const parsed = CustomerListQuery.safeParse(raw);
  const q = parsed.success ? parsed.data : CustomerListQuery.parse({});
  const data = await searchCustomers(q);
  const items = data.items as Row[];

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="People who book care, and the patients they book for"
        actions={
          <LinkButton href="/bookings/new">
            <CalendarPlus size={16} /> New booking
          </LinkButton>
        }
      />
      <Card strong>
        <form action="/customers" className="flex flex-wrap items-center gap-2 border-b border-indigo-100/60 px-4 py-3">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input name="q" defaultValue={raw.q} placeholder="Phone, NIC, name or CUS number" className="field w-72 py-1.5 pl-8" />
          </div>
          <Button size="sm" variant="secondary">
            Search
          </Button>
          {raw.q && (
            <Link href="/customers" className="text-xs text-accent hover:underline">
              Clear
            </Link>
          )}
          <span className="ml-auto text-xs text-muted">New customers are registered from the booking form.</span>
        </form>

        {items.length === 0 ? (
          <EmptyState icon={<Users size={22} />} title="No customers found" text={raw.q ? `Nothing matches “${raw.q}”.` : "Customers appear here after their first booking."} />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Customer</Th>
                  <Th>Phone</Th>
                  <Th>NIC</Th>
                  <Th>City</Th>
                  <Th>Patients</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} className="transition hover:bg-white/50">
                    <Td className="min-w-[220px]">
                      <Link href={`/customers/${c.id}`} className="flex items-center gap-2.5">
                        <Avatar name={c.fullName} size="sm" />
                        <div>
                          <div className="font-medium hover:text-accent">{c.fullName}</div>
                          <div className="text-xs text-muted">{c.customerNo}</div>
                        </div>
                      </Link>
                    </Td>
                    <Td className="whitespace-nowrap">
                      {c.phone}
                      {c.altPhone && <div className="text-xs text-muted">{c.altPhone}</div>}
                    </Td>
                    <Td className="text-muted">{c.nic ?? "—"}</Td>
                    <Td>{c.city ?? "—"}</Td>
                    <Td>{c.patientCount}</Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <LinkButton href={`/customers/${c.id}`} variant="ghost" size="sm">
                          Profile
                        </LinkButton>
                        <LinkButton href={`/bookings/new?customerId=${c.id}`} variant="secondary" size="sm">
                          Book
                        </LinkButton>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pager page={data.page} pageSize={data.pageSize} total={data.total} href={(p) => withParams("/customers", raw, { page: p })} />
          </>
        )}
      </Card>
    </div>
  );
}
