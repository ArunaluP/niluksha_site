import {
  BarChart3,
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
} from "lucide-react";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { Sidebar } from "@/components/app/sidebar";
import { SIDEBAR_COOKIE } from "@/components/app/sidebar-cookie";
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
    items: [
      { href: "/dashboard", label: "Dashboard", icon: <LayoutGrid size={ICON} /> },
      { href: "/reports", label: "Reports", icon: <BarChart3 size={ICON} />, permission: "viewReports" },
    ],
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
  // Read the cookie first: it marks the layout dynamic before any database query (quiet builds).
  const cookieStore = await cookies();
  const [user, settings] = await Promise.all([requireUser(), getSettings()]);
  const brand = settings.company_name || "Care Booking";
  // Only the pages this role may open (pages check again).
  const groups = GROUPS.map((g) => ({
    title: g.title,
    items: g.items.filter((i) => !i.permission || hasPermission(user, i.permission)).map((i) => ({ href: i.href, label: i.label, icon: i.icon, exact: i.exact })),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex min-h-screen gap-5 p-4 lg:p-5">
      <Sidebar
        groups={groups}
        brand={brand}
        userName={user.name}
        roleLabel={ROLE_LABELS[user.role]}
        initialCollapsed={cookieStore.get(SIDEBAR_COOKIE)?.value === "collapsed"}
        logoutAction={logout}
      />

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
