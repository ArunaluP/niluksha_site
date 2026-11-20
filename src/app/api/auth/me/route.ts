import { api } from "@/lib/api";
import { PERMISSIONS, hasPermission, type Permission } from "@/lib/permissions";

/** GET /api/auth/me — who is logged in, and what they may do. */
export const GET = api({}, async ({ user }) => {
  const permissions = (Object.keys(PERMISSIONS) as Permission[]).filter((p) => hasPermission(user, p));
  return { id: user.id, name: user.name, email: user.email, role: user.role, branchId: user.branchId, permissions };
});
