import { getUser, updateUser, UserUpdateSchema } from "@/features/users/service";
import { api, readBody, toId } from "@/lib/api";

/** GET /api/users/:id   (admin) */
export const GET = api<{ id: string }>({ permission: "manageUsers" }, async ({ params }) => getUser(toId(params.id, "User")));

/** PATCH /api/users/:id   { name?, email?, password?, role?, branchId?, isActive? }   (admin) */
export const PATCH = api<{ id: string }>({ permission: "manageUsers" }, async ({ req, params, user }) =>
  updateUser(toId(params.id, "User"), await readBody(req, UserUpdateSchema), user),
);
