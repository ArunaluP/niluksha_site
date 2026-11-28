"use client";

import { ClipboardList, CornerDownLeft, Search, UserRound, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn, niceDate, StatusBadge } from "@/components/ui";
import { Dialog } from "@/components/ui/client";

export type SearchPage = { href: string; label: string; group: string; icon: ReactNode };

type Results = {
  bookings: { bookingNo: string; status: string; serviceDate: string; patientName: string; customerName: string }[];
  customers: { id: number; customerNo: string; fullName: string; phone: string }[];
  employees: { id: number; empNo: string; fullName: string; designation: string | null; branchName: string }[];
};
type Hit = { key: string; href: string; section: string; icon: ReactNode; title: string; sub?: string; badge?: ReactNode };

const EMPTY: Results = { bookings: [], customers: [], employees: [] };

/** Ctrl+K search: menu pages (instant) + bookings, customers and employees (from /api/search). */
export function QuickSearch({ open, onClose, pages }: { open: boolean; onClose: () => void; pages: SearchPage[] }) {
  return (
    <Dialog open={open} onClose={onClose} title="Search" subtitle="Pages, bookings, customers and employees">
      {/* Mounted only while open, so every search starts empty. */}
      <SearchBody onClose={onClose} pages={pages} />
    </Dialog>
  );
}

function SearchBody({ onClose, pages }: { onClose: () => void; pages: SearchPage[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ term: string; data: Results }>({ term: "", data: EMPTY });
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const term = q.trim();

  // The dialog focuses its close button when it opens; move focus to the search box.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, []);
  const searching = term.length >= 2;
  const res = searching && found.term === term ? found.data : EMPTY;
  const loading = searching && found.term !== term;

  // Records: wait until typing pauses (250 ms), at least 2 characters.
  useEffect(() => {
    if (!searching) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const body = await r.json();
        setFound({ term, data: r.ok && body?.data ? body.data : EMPTY });
      } catch {
        if (!ctrl.signal.aborted) setFound({ term, data: EMPTY });
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [term, searching]);

  const hits = useMemo<Hit[]>(() => {
    const term = q.trim().toLowerCase();
    const pageHits: Hit[] = pages
      .filter((p) => !term || p.label.toLowerCase().includes(term) || p.group.toLowerCase().includes(term))
      .map((p) => ({ key: `p${p.href}`, href: p.href, section: "Pages", icon: p.icon, title: p.label, sub: p.group }));
    return [
      ...pageHits,
      ...res.bookings.map((b) => ({
        key: `b${b.bookingNo}`,
        href: `/bookings/${b.bookingNo}`,
        section: "Bookings",
        icon: <ClipboardList size={16} />,
        title: `${b.bookingNo} · ${b.patientName}`,
        sub: `${b.customerName} · ${niceDate(b.serviceDate)}`,
        badge: <StatusBadge status={b.status} />,
      })),
      ...res.customers.map((c) => ({
        key: `c${c.id}`,
        href: `/customers/${c.id}`,
        section: "Customers",
        icon: <Users size={16} />,
        title: c.fullName,
        sub: `${c.customerNo} · ${c.phone}`,
      })),
      ...res.employees.map((e) => ({
        key: `e${e.id}`,
        href: `/employees/${e.id}`,
        section: "Employees",
        icon: <UserRound size={16} />,
        title: e.fullName,
        sub: [e.empNo, e.designation, e.branchName].filter(Boolean).join(" · "),
      })),
    ];
  }, [q, pages, res]);

  const current = Math.min(active, Math.max(hits.length - 1, 0));

  // Keep the highlighted row in view.
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const go = (h: Hit | undefined) => {
    if (!h) return;
    onClose();
    router.push(h.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(current + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(current - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(hits[current]);
    }
  };

  return (
    <div className="px-6 pb-5" onKeyDown={onKeyDown}>
        <div className="flex h-11 items-center gap-2.5 rounded-xl border border-indigo-100 bg-white/80 px-3 focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/15">
          <Search size={16} className="text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            placeholder="Booking no, name, phone, EMP no or a page…"
            className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted/70"
            aria-label="Search"
          />
          {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />}
        </div>

        <div ref={listRef} className="mt-3 max-h-[55vh] space-y-0.5 overflow-y-auto scroll-thin">
          {hits.length === 0 && !loading && (
            <p className="py-8 text-center text-sm text-muted">{term.length < 2 ? "Type at least 2 letters to search records." : `Nothing found for “${term}”.`}</p>
          )}
          {hits.map((h, i) => (
            <div key={h.key}>
              {(i === 0 || hits[i - 1].section !== h.section) && (
                <div className="px-2 pt-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted/80">{h.section}</div>
              )}
              <button
                data-i={i}
                onClick={() => go(h)}
                onMouseMove={() => setActive(i)}
                className={cn("flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition", i === current ? "bg-accent-soft/90" : "hover:bg-white/60")}
              >
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", i === current ? "bg-white text-accent" : "bg-white/60 text-muted")}>{h.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{h.title}</span>
                  {h.sub && <span className="block truncate text-[11px] text-muted">{h.sub}</span>}
                </span>
                {h.badge}
                {i === current && <CornerDownLeft size={14} className="text-muted" />}
              </button>
            </div>
          ))}
        </div>
        {term.length < 2 && hits.length > 0 && <p className="mt-3 text-[11px] text-muted">Type at least 2 letters to also search bookings, customers and employees.</p>}
    </div>
  );
}
