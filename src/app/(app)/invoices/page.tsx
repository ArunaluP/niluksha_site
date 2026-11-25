import { FileText, Search } from "lucide-react";
import Link from "next/link";
import { Pager, Tabs, withParams } from "@/components/app/list-tools";
import { Avatar, Button, Card, EmptyState, LinkButton, money, niceDate, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui";
import { InvoiceListQuery, listInvoices } from "@/features/invoices/service";
import { requirePermission } from "@/lib/dal";

export const metadata = { title: "Invoices · Care Booking" };

type Row = {
  id: number;
  invoiceNo: string;
  invoiceDate: string;
  status: string;
  amount: string;
  printCount: number;
  bookingId: number;
  bookingNo: string;
  serviceDate: string;
  customerName: string;
  customerPhone: string;
  branchName: string;
};

export default async function InvoicesPage({ searchParams }: PageProps<"/invoices">) {
  const user = await requirePermission("viewInvoices");
  const raw = Object.fromEntries(Object.entries(await searchParams).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const parsed = InvoiceListQuery.safeParse(raw);
  const q = parsed.success ? parsed.data : InvoiceListQuery.parse({});
  const data = await listInvoices(q, user);
  const items = data.items as Row[];
  const total = items.reduce((a, i) => a + Number(i.amount), 0);

  return (
    <div>
      <PageHeader title="Invoices" subtitle="Created automatically when a session is delivered" />
      <Card strong>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-100/60 px-4 py-3">
          <Tabs
            items={[
              { href: withParams("/invoices", raw, { status: "generated", page: undefined }), label: "Waiting to print", active: raw.status === "generated" },
              { href: withParams("/invoices", raw, { status: "printed", page: undefined }), label: "Printed", active: raw.status === "printed" },
              { href: withParams("/invoices", raw, { status: undefined, page: undefined }), label: "All", active: !raw.status },
            ]}
          />
          <form className="flex flex-wrap items-center gap-2" action="/invoices">
            {raw.status && <input type="hidden" name="status" value={raw.status} />}
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input name="q" defaultValue={raw.q} placeholder="Invoice, booking, customer" className="field w-56 py-1.5 pl-8" />
            </div>
            <input type="date" name="from" defaultValue={raw.from} className="field w-auto py-1.5" title="From" />
            <input type="date" name="to" defaultValue={raw.to} className="field w-auto py-1.5" title="To" />
            <Button size="sm" variant="secondary">
              Filter
            </Button>
          </form>
        </div>

        {items.length === 0 ? (
          <EmptyState icon={<FileText size={22} />} title="No invoices here" text="Invoices appear when a booking is marked delivered." />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Invoice</Th>
                  <Th>Customer</Th>
                  <Th>Booking</Th>
                  <Th>Branch</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Amount</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="transition hover:bg-white/50">
                    <Td className="whitespace-nowrap">
                      <Link href={`/invoices/${i.id}`} className="font-semibold text-accent hover:underline">
                        {i.invoiceNo}
                      </Link>
                      <div className="text-xs text-muted">{niceDate(i.invoiceDate)}</div>
                    </Td>
                    <Td className="min-w-[200px]">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={i.customerName} size="sm" />
                        <div>
                          <div className="font-medium">{i.customerName}</div>
                          <div className="text-xs text-muted">{i.customerPhone}</div>
                        </div>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">
                      <Link href={`/bookings/${i.bookingNo}`} className="hover:text-accent">
                        {i.bookingNo}
                      </Link>
                      <div className="text-xs text-muted">Session {niceDate(i.serviceDate)}</div>
                    </Td>
                    <Td>{i.branchName}</Td>
                    <Td>
                      <StatusBadge status={i.status} />
                      {i.printCount > 0 && <div className="mt-1 text-[11px] text-muted">printed {i.printCount}×</div>}
                    </Td>
                    <Td className="whitespace-nowrap text-right font-semibold">{money(i.amount)}</Td>
                    <Td className="text-right">
                      <LinkButton href={`/invoices/${i.id}`} variant="secondary" size="sm">
                        Open
                      </LinkButton>
                    </Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-right text-xs text-muted">
                    Total on this page
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{money(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </Table>
            <Pager page={data.page} pageSize={data.pageSize} total={data.total} href={(p) => withParams("/invoices", raw, { page: p })} />
          </>
        )}
      </Card>
    </div>
  );
}
