import { eq, type SQL } from "drizzle-orm";
import type { MySqlColumn } from "drizzle-orm/mysql-core";
import type { UserRole } from "@/db/schema";

/**
 * Who can do what — one place to change it.
 * "admin" in the database is shown as **Director** in the app.
 * Branch managers are VIEW ONLY for their own branch.
 * Pages call requirePermission(), server actions use protectedAction({ permission }).
 */
export const PERMISSIONS = {
  manageUsers: ["admin"],
  manageBranches: ["admin"],
  manageHospitals: ["admin"],
  manageSettings: ["admin"],
  viewMasterData: ["admin", "call_center", "branch_manager"],
  manageEmployees: ["admin"], // employees + leave: Director only
  manageCustomers: ["admin", "call_center"],
  createBooking: ["admin", "call_center"],
  useCallList: ["admin", "call_center"],
  assignEmployee: ["admin", "call_center"],
  markDelivered: ["admin", "call_center"],
  viewInvoices: ["admin", "call_center", "branch_manager"], // branch managers: own branch, view only
  printInvoice: ["admin", "call_center"],
  viewReports: ["admin", "call_center", "branch_manager"],
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
