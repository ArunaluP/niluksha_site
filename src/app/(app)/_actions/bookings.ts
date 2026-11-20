"use server";

/**
 * Server actions used by the screens. Each one is a thin wrapper:
 * protectedAction (login + permission + validation) → the same service the REST API uses.
 */
import { revalidatePath } from "next/cache";
import * as z from "zod";
import {
  assignEmployee,
  BookingCreateSchema,
  BookingUpdateSchema,
  confirmBooking,
  createBooking,
  deliverBooking,
  getAvailableForBooking,
  ignoreBooking,
  unassignEmployee,
  updateBooking,
} from "@/features/bookings/service";
import { addPatient, createCustomer, CustomerCreateSchema, PatientCreateSchema, searchCustomers, getCustomer } from "@/features/customers/service";
import { markInvoicePrinted, recordPrint } from "@/features/invoices/service";
import { protectedAction } from "@/lib/action";
import { id, optText } from "@/lib/validation";

const WithNote = z.object({ id, note: optText(255) });
const refresh = () => revalidatePath("/", "layout");

// ------------------------------------------------------------ booking workflow
export const confirmBookingAction = protectedAction({ permission: "useCallList", schema: WithNote }, async ({ id, note }, user) => {
  await confirmBooking(id, user, note);
  refresh();
  return null;
});

export const ignoreBookingAction = protectedAction({ permission: "useCallList", schema: WithNote }, async ({ id, note }, user) => {
  await ignoreBooking(id, user, note);
  refresh();
  return null;
});

export const availableEmployeesAction = protectedAction({ permission: "assignEmployee", schema: z.object({ id }) }, async ({ id }) =>
  getAvailableForBooking(id),
);

export const assignEmployeeAction = protectedAction(
  { permission: "assignEmployee", schema: z.object({ id, employeeId: id, note: optText(255) }) },
  async ({ id, employeeId, note }, user) => {
    await assignEmployee(id, employeeId, user, note);
    refresh();
    return null;
  },
);

export const unassignEmployeeAction = protectedAction({ permission: "assignEmployee", schema: WithNote }, async ({ id, note }, user) => {
  await unassignEmployee(id, user, note);
  refresh();
  return null;
});

export const deliverBookingAction = protectedAction({ permission: "markDelivered", schema: WithNote }, async ({ id, note }, user) => {
  const res = await deliverBooking(id, user, note);
  refresh();
  return { invoiceId: res.invoiceId };
});

// ------------------------------------------------------------ booking form
export const createBookingAction = protectedAction({ permission: "createBooking", schema: BookingCreateSchema }, async (input, user) => {
  const b = await createBooking(input, user);
  refresh();
  return { id: b.id, bookingNo: b.bookingNo };
});

export const updateBookingAction = protectedAction(
  { permission: "createBooking", schema: BookingUpdateSchema.extend({ id }) },
  async ({ id, ...input }, user) => {
    await updateBooking(id, input, user);
    refresh();
    return null;
  },
);

export const searchCustomersAction = protectedAction(
  { permission: "manageCustomers", schema: z.object({ q: z.string().trim().min(2).max(100) }) },
  async ({ q }) => (await searchCustomers({ q, page: 1, pageSize: 8 })).items as { id: number; customerNo: string; fullName: string; phone: string; nic: string | null; city: string | null; patientCount: number }[],
);

export const getCustomerAction = protectedAction({ permission: "manageCustomers", schema: z.object({ id }) }, async ({ id }) => getCustomer(id));

export const createCustomerAction = protectedAction({ permission: "manageCustomers", schema: CustomerCreateSchema }, async (input, user) => {
  const c = await createCustomer(input, user);
  refresh();
  return c;
});

export const addPatientAction = protectedAction(
  { permission: "manageCustomers", schema: PatientCreateSchema.extend({ customerId: id }) },
  async ({ customerId, ...input }) => {
    const p = await addPatient(customerId, input);
    refresh();
    return p;
  },
);

// ------------------------------------------------------------ invoices
export const recordPrintAction = protectedAction({ permission: "printInvoice", schema: z.object({ id }) }, async ({ id }, user) => {
  await recordPrint(id, user);
  return null;
});

export const markInvoicePrintedAction = protectedAction({ permission: "printInvoice", schema: WithNote }, async ({ id, note }, user) => {
  await markInvoicePrinted(id, user, note);
  refresh();
  return null;
});
