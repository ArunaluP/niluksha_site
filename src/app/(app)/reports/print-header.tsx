import { niceDateTime } from "@/components/ui";

/** Shown only on paper: company, report, period, who printed it. */
export function PrintHeader({ company, title, subtitle, by }: { company?: string; title: string; subtitle: string; by: string }) {
  return (
    <div className="hidden border-b border-slate-300 pb-3 print:block">
      <div className="text-lg font-semibold text-slate-900">{company || "Care Services"}</div>
      <div className="text-sm text-slate-700">
        {title} · {subtitle}
      </div>
      <div className="text-xs text-slate-500">
        Printed {niceDateTime(new Date())} by {by}
      </div>
    </div>
  );
}
