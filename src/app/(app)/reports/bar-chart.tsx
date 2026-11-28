import { cn, niceDate } from "@/components/ui";

export type ChartData = { unit: "day" | "week"; bars: { key: string; from: string; to: string; count: number }[] };

const shortDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
};

/** Small bar chart (plain HTML/CSS): one bar per day (or week), zero days shown as a thin stub. */
export function BarChart({ chart }: { chart: ChartData }) {
  const bars = chart.bars;
  const max = Math.max(1, ...bars.map((b) => b.count));
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, Math.round(max / 2), max];
  // Label every Nth bar so labels never overlap.
  const every = Math.max(1, Math.ceil(bars.length / 12));

  return (
    <div className="flex gap-3 pt-5">
      {/* y axis */}
      <div className="relative h-36 w-6 shrink-0 text-right text-[10px] text-muted">
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 -translate-y-1/2" style={{ bottom: `${(t / max) * 100}%`, transform: "translateY(50%)" }}>
            {t}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative h-36 border-b border-l border-indigo-100">
          {ticks.slice(1).map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-dashed border-indigo-100/80" style={{ bottom: `${(t / max) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-[3px] px-1">
            {bars.map((b) => {
              const label = chart.unit === "day" ? niceDate(b.from) : `${shortDay(b.from)} – ${shortDay(b.to)}`;
              return (
                <div key={b.key} className="group relative flex h-full flex-1 items-end justify-center" title={`${label}: ${b.count} session${b.count === 1 ? "" : "s"}`}>
                  <div
                    className={cn(
                      "w-full max-w-[18px] rounded-t-md transition",
                      b.count ? "bg-gradient-to-t from-accent to-accent-2 group-hover:brightness-110" : "bg-indigo-100/80",
                    )}
                    style={{ height: b.count ? `${(b.count / max) * 100}%` : "2px" }}
                  />
                  {b.count > 0 && max > 1 && bars.length <= 31 && (
                    <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-ink/70">{b.count}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-1.5 flex gap-[3px] px-1">
          {bars.map((b, i) => (
            <div key={b.key} className="flex-1 overflow-visible text-center text-[10px] whitespace-nowrap text-muted">
              {i % every === 0 ? shortDay(b.from) : ""}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
