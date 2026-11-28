"use client";

import { HeartPulse, LogOut, PanelLeft, Search } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Avatar, cn } from "@/components/ui";
import { NavLink } from "@/components/ui/client";
import { QuickSearch, type SearchPage } from "./quick-search";
import { SIDEBAR_COOKIE } from "./sidebar-cookie";

export type SidebarItem = { href: string; label: string; icon: ReactNode; exact?: boolean };
export type SidebarGroup = { title: string; items: SidebarItem[] };


/**
 * The left menu. Collapses to icons only (button next to the company name, or Ctrl+B),
 * remembered per browser. The search box (Ctrl+K) finds pages, bookings, customers and employees.
 */
export function Sidebar({
  groups,
  brand,
  userName,
  roleLabel,
  initialCollapsed,
  logoutAction,
}: {
  groups: SidebarGroup[];
  brand: string;
  userName: string;
  roleLabel: string;
  initialCollapsed: boolean;
  logoutAction: () => Promise<void>;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [searchOpen, setSearchOpen] = useState(false);

  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });

  // Ctrl/⌘+K opens the search; Ctrl/⌘+B collapses / expands the sidebar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const k = e.key.toLowerCase();
      if (k === "k") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (k === "b") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pages: SearchPage[] = groups.flatMap((g) => g.items.map((i) => ({ href: i.href, label: i.label, group: g.title, icon: i.icon })));

  return (
    <>
      <aside
        className={cn(
          "glass no-print sticky top-5 hidden h-[calc(100vh-2.5rem)] shrink-0 flex-col transition-[width] duration-200 md:flex",
          collapsed ? "w-[76px]" : "w-60",
        )}
      >
        {/* Brand + collapse button */}
        {collapsed ? (
          <div className="flex flex-col items-center gap-2 px-3 pt-5 pb-3">
            <button
              onClick={toggle}
              title={`${brand} — expand menu (Ctrl+B)`}
              aria-label="Expand menu"
              className="group relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#6658f5] to-[#a78bfa] text-white shadow-md"
            >
              <HeartPulse size={18} className="transition group-hover:opacity-0" />
              <PanelLeft size={17} className="absolute opacity-0 transition group-hover:opacity-100" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 pt-5 pr-3 pb-3 pl-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#6658f5] to-[#a78bfa] text-white shadow-md">
              <HeartPulse size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 text-[13px] font-semibold leading-tight" title={brand}>
                {brand}
              </div>
              <div className="text-[11px] text-muted">Care booking system</div>
            </div>
            <button
              onClick={toggle}
              title="Collapse menu (Ctrl+B)"
              aria-label="Collapse menu"
              className="rounded-lg p-1.5 text-muted transition hover:bg-white/70 hover:text-ink"
            >
              <PanelLeft size={17} />
            </button>
          </div>
        )}

        {/* Search */}
        <div className="px-3 pb-3">
          {collapsed ? (
            <button
              onClick={() => setSearchOpen(true)}
              title="Search (Ctrl+K)"
              aria-label="Search"
              className="flex h-10 w-full items-center justify-center rounded-xl border border-white/80 bg-white/60 text-muted transition hover:bg-white hover:text-ink"
            >
              <Search size={16} />
            </button>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="flex h-10 w-full items-center gap-2.5 rounded-xl border border-white/80 bg-white/60 px-3 text-[13px] text-muted transition hover:bg-white hover:text-ink"
            >
              <Search size={16} />
              <span className="flex-1 text-left">Search…</span>
              <kbd className="rounded-md border border-indigo-100 bg-white/80 px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted">Ctrl K</kbd>
            </button>
          )}
        </div>

        <nav className={cn("flex-1 overflow-y-auto px-3 pb-4 scroll-thin", collapsed ? "space-y-3" : "space-y-5")}>
          {groups.map((g, gi) => (
            <div key={g.title}>
              {collapsed ? (
                gi > 0 && <div className="mx-3 mb-3 border-t border-indigo-100/70" />
              ) : (
                <div className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted/80">{g.title}</div>
              )}
              <div className="space-y-0.5">
                {g.items.map((i) => (
                  <NavLink key={i.href} href={i.href} icon={i.icon} exact={i.exact} collapsed={collapsed}>
                    {i.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Logged-in user */}
        {collapsed ? (
          <div className="m-3 flex flex-col items-center gap-2 rounded-2xl bg-white/60 py-3">
            <span title={`${userName} · ${roleLabel}`}>
              <Avatar name={userName} />
            </span>
            <form action={logoutAction}>
              <button className="rounded-lg p-1.5 text-muted hover:bg-white hover:text-rose-600" title="Log out" aria-label="Log out">
                <LogOut size={16} />
              </button>
            </form>
          </div>
        ) : (
          <div className="m-3 flex items-center gap-3 rounded-2xl bg-white/60 p-3">
            <Avatar name={userName} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold">{userName}</div>
              <div className="text-[11px] text-muted">{roleLabel}</div>
            </div>
            <form action={logoutAction}>
              <button className="rounded-lg p-1.5 text-muted hover:bg-white hover:text-rose-600" title="Log out" aria-label="Log out">
                <LogOut size={16} />
              </button>
            </form>
          </div>
        )}
      </aside>

      <QuickSearch open={searchOpen} onClose={() => setSearchOpen(false)} pages={pages} />
    </>
  );
}
