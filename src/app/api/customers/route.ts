import { createCustomer, CustomerCreateSchema, CustomerListQuery, searchCustomers } from "@/features/customers/service";
import { api, ok, readBody, readQuery } from "@/lib/api";

/** GET /api/customers?q=0771234567&page=&pageSize=   (q matches phone, NIC, name, customer no) */
export const GET = api({ permission: "manageCustomers" }, async ({ req }) => searchCustomers(readQuery(req, CustomerListQuery)));

/** POST /api/customers   { fullName, phone, nic?, altPhone?, address?, city?, notes?, patients?: [...] } */
export const POST = api({ permission: "manageCustomers" }, async ({ req, user }) =>
  ok(await createCustomer(await readBody(req, CustomerCreateSchema), user), 201),
);
