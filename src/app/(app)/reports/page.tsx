import { ArrowUpRight, UserRound, UsersRound } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/dal";

export const metadata = { title: "Reports · Care Booking" };

/** /reports — pick a report. Two frosted-glass cards. */
export default async function ReportsHome() {
  const user = await requirePermission("viewReports");
  const scope = user.role === "branch_manager" ? " (your branch)" : "";

  return (
    <div>
      <PageHeader title="Reports" subtitle={`Choose a report${scope}`} />
      <div className="grid max-w-4xl gap-5 sm:grid-cols-2">
        <ReportCard
          href="/reports/activity"
          icon={<UserRound size={30} strokeWidth={1.6} />}
          title="Customer Reports"
          text="Every booking action in a period (new, confirmed, assigned, delivered, invoiced) with totals and money."
        />
        <ReportCard
          href="/reports/employees"
          icon={<UsersRound size={30} strokeWidth={1.6} />}
          title="Employee Reports"
          text="Who completed the most sessions in a period, with each employee's sessions and a daily chart."
        />
      </div>
    </div>
  );
}

function ReportCard({ href, icon, title, text }: { href: string; icon: ReactNode; title: string; text: string }) {
  return (
    <Link
      href={href}
      className="group relative isolate flex min-h-[220px] flex-col justify-between overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/35 p-7 shadow-[0_20px_45px_-20px_rgba(76,81,191,0.35),inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-2xl backdrop-saturate-150 transition duration-300 hover:-translate-y-1 hover:bg-white/50 hover:shadow-[0_28px_60px_-22px_rgba(102,88,245,0.45),inset_0_1px_0_rgba(255,255,255,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
    >
      {/* soft inner sheen, top-left → transparent */}
      <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-white/70 via-white/10 to-transparent" />
      {/* glow along the bottom edge (theme accent instead of the sample's orange) */}
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-10 left-1/2 -z-10 h-20 w-3/4 -translate-x-1/2 rounded-full bg-gradient-to-r from-accent/0 via-accent/45 to-accent-2/0 blur-2xl transition-opacity duration-300 group-hover:opacity-100 opacity-70"
      />
      <span aria-hidden className="pointer-events-none absolute inset-x-10 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />

      <div className="flex items-start justify-between">
        <span className="text-accent">{icon}</span>
        <ArrowUpRight size={20} className="text-muted transition duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent" />
      </div>
      <div>
        <div className="text-xl font-semibold tracking-tight text-ink">{title}</div>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{text}</p>
      </div>
    </Link>
  );
}
