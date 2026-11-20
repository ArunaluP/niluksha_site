import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/components/ui";

/** Builds a URL from the current params with some values replaced (empty = removed). */
export function withParams(base: string, current: Record<string, string | undefined>, change: Record<string, string | number | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...change })) if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

export function Tabs({ items }: { items: { href: string; label: string; active: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((t) => (
        <Link
          key={t.href + t.label}
          href={t.href}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition",
            t.active ? "bg-accent text-white shadow-sm" : "text-muted hover:bg-white/70 hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function Pager({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between px-4 py-3 text-xs text-muted">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <PageLink href={href(page - 1)} disabled={page <= 1}>
          <ChevronLeft size={14} />
        </PageLink>
        <span className="px-2 font-medium text-ink">
          {page} / {pages}
        </span>
        <PageLink href={href(page + 1)} disabled={page >= pages}>
          <ChevronRight size={14} />
        </PageLink>
      </div>
    </div>
  );
}

function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  if (disabled) return <span className="rounded-lg p-1.5 opacity-40">{children}</span>;
  return (
    <Link href={href} className="rounded-lg bg-white/70 p-1.5 text-ink hover:bg-white">
      {children}
    </Link>
  );
}
