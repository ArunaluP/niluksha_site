import { createUser, listUsers, UserCreateSchema, UserListQuery } from "@/features/users/service";
import { api, ok, readBody, readQuery } from "@/lib/api";

/** GET /api/users?role=&search=&active=   (admin) */
export const GET = api({ permission: "manageUsers" }, async ({ req }) => listUsers(readQuery(req, UserListQuery)));

/** POST /api/users   { name, email, password, role, branchId? }   (admin) */
export const POST = api({ permission: "manageUsers" }, async ({ req }) =>
  ok(await createUser(await readBody(req, UserCreateSchema)), 201),
);
