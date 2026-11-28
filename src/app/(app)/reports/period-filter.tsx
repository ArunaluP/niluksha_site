import { Tabs, withParams } from "@/components/app/list-tools";
import { Button, Card, Select } from "@/components/ui";
import { addDays, today } from "@/lib/dates";

/** Today, yesterday, this week (Monday →), this month, last 30 / 90 days (Sri Lanka dates). */
export function periodPresets() {
  const t = today();
  const [y, m, d] = t.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return [
    { key: "today", label: "Today", from: t, to: t },
    { key: "yesterday", label: "Yesterday", from: addDays(t, -1), to: addDays(t, -1) },
    { key: "week", label: "This week", from: addDays(t, -((dow + 6) % 7)), to: t },
    { key: "month", label: "This month", from: `${t.slice(0, 8)}01`, to: t },
    { key: "30d", label: "Last 30 days", from: addDays(t, -29), to: t },
    { key: "90d", label: "Last 90 days", from: addDays(t, -89), to: t },
  ];
}

/**
 * Period tabs + custom dates + (Director) branch select, all as URL params,
 * so the page stays a server component and links can be shared.
 */
export function PeriodFilter({
  path,
  base,
  custom,
  branches,
}: {
  path: string;
  base: Record<string, string | undefined>;
  custom: boolean;
  branches?: { id: number; name: string }[];
}) {
  const presets = periodPresets();
  const active = custom ? "custom" : (presets.find((p) => p.from === base.from && p.to === base.to)?.key ?? "custom");

  return (
    <Card strong className="no-print flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <Tabs
        items={[
          ...presets.map((p) => ({ href: withParams(path, base, { from: p.from, to: p.to, page: undefined, custom: undefined }), label: p.label, active: active === p.key })),
          { href: withParams(path, base, { custom: "1" }), label: "Custom", active: active === "custom" },
        ]}
      />
      {(active === "custom" || branches) && (
        <form action={path} className="flex flex-wrap items-center gap-2">
          {active === "custom" ? (
            <>
              <input type="hidden" name="custom" value="1" />
              <input type="date" name="from" defaultValue={base.from} max={today()} className="field w-auto py-1.5" aria-label="From date" />
              <span className="text-xs text-muted">to</span>
              <input type="date" name="to" defaultValue={base.to} max={today()} className="field w-auto py-1.5" aria-label="To date" />
            </>
          ) : (
            <>
              <input type="hidden" name="from" value={base.from} />
              <input type="hidden" name="to" value={base.to} />
            </>
          )}
          {branches && (
            <Select name="branchId" defaultValue={base.branchId ?? ""} className="w-auto py-1.5" aria-label="Branch">
              <option value="">All branches</option>
              {branches.map((b) => (
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
  );
}
