import { eq, isNull, or, type SQL } from "drizzle-orm";
import type { MySqlColumn } from "drizzle-orm/mysql-core";
import type { UserRole } from "@/db/schema";

/**
 * Who can do what — one place to change it.
 * "admin" in the database is shown as **Director** in the app.
 * Branch managers work like the call center for THEIR branch:
 *   - see every new booking that has no branch yet (pending / confirmed), plus their branch's bookings
 *   - create, confirm, cancel and edit bookings; assign ONLY their own branch's employees
 *   - deliver, print / WhatsApp invoices, export to Drive; register employees + leave of their branch
 * Pages call requirePermission(), server actions use protectedAction({ permission }).
 */
export const PERMISSIONS = {
  manageUsers: ["admin"],
  manageBranches: ["admin"],
  manageHospitals: ["admin"],
  manageSettings: ["admin"],
  managePackages: ["admin"], // create / edit care packages: Director only
  viewPackages: ["admin", "call_center", "branch_manager"],
  viewMasterData: ["admin", "call_center", "branch_manager"],
  manageEmployees: ["admin", "branch_manager"], // employees + leave (branch managers: own branch only)
  manageCustomers: ["admin", "call_center", "branch_manager"], // customers are company-wide
  createBooking: ["admin", "call_center", "branch_manager"],
  useCallList: ["admin", "call_center", "branch_manager"],
  assignEmployee: ["admin", "call_center", "branch_manager"], // branch managers: own branch's employees only
  markDelivered: ["admin", "call_center", "branch_manager"],
  viewInvoices: ["admin", "call_center", "branch_manager"], // branch managers: own branch
  printInvoice: ["admin", "call_center", "branch_manager"], // print, mark printed, WhatsApp
  viewReports: ["admin", "call_center", "branch_manager"],
  saveReportsToDrive: ["admin", "call_center", "branch_manager"], // Excel export → Google Drive
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Director",
  call_center: "Call Center",
  branch_manager: "Branch Manager",
};

type HasRole = { role: UserRole };
type HasBranch = HasRole & { branchId: number | null };

export function hasPermission(user: HasRole, permission: Permission) {
  return (PERMISSIONS[permission] as readonly UserRole[]).includes(user.role);
}

/**
 * Branch scoping for queries. Branch managers only ever see their own branch;
 * everyone else sees all branches.
 *
 *   db.select().from(bookings).where(and(eq(...), branchScope(user, bookings.branchId)))
 */
export function branchScope(user: HasBranch, column: MySqlColumn): SQL | undefined {
  if (user.role !== "branch_manager") return undefined;
  // A branch manager with no branch sees nothing (id -1 never matches).
  return eq(column, user.branchId ?? -1);
}

/** For single records: may this user touch a record belonging to branchId? */
export function canAccessBranch(user: HasBranch, branchId: number | null) {
  if (user.role !== "branch_manager") return true;
  return branchId !== null && branchId === user.branchId;
}

/**
 * Booking scoping. A booking gets its branch when an employee is assigned, so
 * new (pending / confirmed) bookings have no branch: every branch manager sees
 * those, plus the bookings of their own branch.
 */
export function bookingScope(user: HasBranch, column: MySqlColumn): SQL | undefined {
  if (user.role !== "branch_manager") return undefined;
  return or(isNull(column), eq(column, user.branchId ?? -1));
}

/** For a single booking: unassigned (no branch) or the manager's own branch. */
export function canAccessBooking(user: HasBranch, branchId: number | null) {
  if (user.role !== "branch_manager") return true;
  return branchId === null || branchId === user.branchId;
}

/** The only branch whose employees this user may assign (undefined = any branch). */
export function assignableBranch(user: HasBranch): number | undefined {
  return user.role === "branch_manager" ? (user.branchId ?? -1) : undefined;
}
