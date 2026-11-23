import {
  Building2,
  CalendarPlus,
  ClipboardList,
  FileText,
  Hospital,
  LayoutGrid,
  LogOut,
  Package,
  PhoneCall,
  Settings,
  UserCog,
  UserRound,
  Users,
  UserCheck,
  HeartPulse,
} from "lucide-react";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui";
import { NavLink } from "@/components/ui/client";
import { requireUser } from "@/lib/dal";
import { hasPermission, ROLE_LABELS, type Permission } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { logout } from "../(auth)/login/actions";

type Item = { href: string; label: string; icon: ReactNode; permission?: Permission; exact?: boolean };
const ICON = 17;

/** Sidebar groups. Items appear only for roles that may use them (pages check again). */
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: <LayoutGrid size={ICON} /> }],
  },
  {
    title: "Operations",
    items: [
      { href: "/bookings/new", label: "New Booking", icon: <CalendarPlus size={ICON} />, permission: "createBooking", exact: true },
      { href: "/call-list", label: "Call List", icon: <PhoneCall size={ICON} />, permission: "useCallList" },
      { href: "/assignments", label: "Assignments", icon: <UserCheck size={ICON} />, permission: "assignEmployee" },
      { href: "/bookings", label: "Bookings", icon: <ClipboardList size={ICON} />, permission: "viewReports", exact: true },
      { href: "/invoices", label: "Invoices", icon: <FileText size={ICON} />, permission: "viewInvoices" },
    ],
  },
  {
    title: "Records",
    items: [
      { href: "/customers", label: "Customers", icon: <Users size={ICON} />, permission: "manageCustomers" },
      { href: "/employees", label: "Employees", icon: <UserRound size={ICON} />, permission: "viewMasterData" },
      { href: "/hospitals", label: "Hospitals", icon: <Hospital size={ICON} />, permission: "viewMasterData" },
      { href: "/branches", label: "Branches", icon: <Building2 size={ICON} />, permission: "viewMasterData" },
    ],
  },
  {
    title: "Settings",
    items: [
      { href: "/users", label: "Users", icon: <UserCog size={ICON} />, permission: "manageUsers" },
      { href: "/packages", label: "Packages", icon: <Package size={ICON} />, permission: "managePackages" },
      { href: "/settings", label: "Settings", icon: <Settings size={ICON} />, permission: "manageSettings" },
    ],
  },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const [user, settings] = await Promise.all([requireUser(), getSettings()]);
  const brand = settings.company_name || "Care Booking";

  return (
    <div className="flex min-h-screen gap-5 p-4 lg:p-5">
      {/* Sidebar */}
      <aside className="glass no-print sticky top-5 hidden h-[calc(100vh-2.5rem)] w-60 shrink-0 flex-col md:flex">
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#6658f5] to-[#a78bfa] text-white shadow-md">
            <HeartPulse size={18} />
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold leading-tight">{brand}</div>
            <div className="text-[11px] text-muted">Care booking system</div>
          </div>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4 scroll-thin">
          {GROUPS.map((g) => {
            const items = g.items.filter((i) => !i.permission || hasPermission(user, i.permission));
            if (!items.length) return null;
            return (
              <div key={g.title}>
                <div className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted/80">{g.title}</div>
                <div className="space-y-0.5">
                  {items.map((i) => (
                    <NavLink key={i.href} href={i.href} icon={i.icon} exact={i.exact}>
                      {i.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="m-3 flex items-center gap-3 rounded-2xl bg-white/60 p-3">
          <Avatar name={user.name} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold">{user.name}</div>
            <div className="text-[11px] text-muted">{ROLE_LABELS[user.role]}</div>
          </div>
          <form action={logout}>
            <button className="rounded-lg p-1.5 text-muted hover:bg-white hover:text-rose-600" title="Log out" aria-label="Log out">
              <LogOut size={16} />
            </button>
          </form>
        </div>
      </aside>

      {/* Page */}
      <main className="min-w-0 flex-1 pb-10">
        {/* Small screens: the sidebar becomes a scrollable menu bar */}
        <div className="glass no-print mb-4 flex items-center gap-1 overflow-x-auto px-2 py-2 scroll-thin md:hidden">
          {GROUPS.flatMap((g) => g.items)
            .filter((i) => !i.permission || hasPermission(user, i.permission))
            .map((i) => (
              <div key={i.href} className="shrink-0">
                <NavLink href={i.href} icon={i.icon} exact={i.exact}>
                  {i.label}
                </NavLink>
              </div>
            ))}
          <form action={logout} className="ml-auto shrink-0">
            <button className="rounded-lg p-2 text-muted hover:text-rose-600" aria-label="Log out">
              <LogOut size={16} />
            </button>
          </form>
        </div>
        {children}
      </main>
    </div>
  );
}
