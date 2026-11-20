import { CustomerUpdateSchema, getCustomer, updateCustomer } from "@/features/customers/service";
import { api, readBody, toId } from "@/lib/api";

/** GET /api/customers/:id   (with patients + 20 most recent bookings) */
export const GET = api<{ id: string }>({ permission: "manageCustomers" }, async ({ params }) => getCustomer(toId(params.id, "Customer")));

/** PATCH /api/customers/:id */
export const PATCH = api<{ id: string }>({ permission: "manageCustomers" }, async ({ req, params }) =>
  updateCustomer(toId(params.id, "Customer"), await readBody(req, CustomerUpdateSchema)),
);
