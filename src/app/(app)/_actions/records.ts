"use server";

/** Server actions for master data screens — thin wrappers over the same services as the REST API. */
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { BranchCreateSchema, BranchUpdateSchema, createBranch, updateBranch } from "@/features/branches/service";
import { CustomerUpdateSchema, PatientUpdateSchema, updateCustomer, updatePatient } from "@/features/customers/service";
import { addLeave, createEmployee, deleteLeave, EmployeeCreateSchema, EmployeeUpdateSchema, LeaveCreateSchema, updateEmployee } from "@/features/employees/service";
import { createHospital, HospitalCreateSchema, HospitalUpdateSchema, updateHospital } from "@/features/hospitals/service";
import { SettingsUpdateSchema, updateSettings } from "@/features/settings/service";
import { createUser, updateUser, UserCreateSchema, UserUpdateSchema } from "@/features/users/service";
import { protectedAction } from "@/lib/action";
import { id } from "@/lib/validation";

const refresh = () => revalidatePath("/", "layout");

// branches
export const createBranchAction = protectedAction({ permission: "manageBranches", schema: BranchCreateSchema }, async (input) => {
  const r = await createBranch(input);
  refresh();
  return { id: r.id };
});
export const updateBranchAction = protectedAction({ permission: "manageBranches", schema: BranchUpdateSchema.extend({ id }) }, async ({ id, ...input }) => {
  await updateBranch(id, input);
  refresh();
  return null;
});

// hospitals
export const createHospitalAction = protectedAction({ permission: "manageHospitals", schema: HospitalCreateSchema }, async (input) => {
  const r = await createHospital(input);
  refresh();
  return { id: r.id };
});
export const updateHospitalAction = protectedAction({ permission: "manageHospitals", schema: HospitalUpdateSchema.extend({ id }) }, async ({ id, ...input }) => {
  await updateHospital(id, input);
  refresh();
  return null;
});

// employees + leave
export const createEmployeeAction = protectedAction({ permission: "manageEmployees", schema: EmployeeCreateSchema }, async (input, user) => {
  const r = await createEmployee(input, user);
  refresh();
  return { id: r.id };
});
export const updateEmployeeAction = protectedAction({ permission: "manageEmployees", schema: EmployeeUpdateSchema.extend({ id }) }, async ({ id, ...input }, user) => {
  await updateEmployee(id, input, user);
  refresh();
  return null;
});
export const addLeaveAction = protectedAction(
  { permission: "manageEmployees", schema: z.object({ employeeId: id }).and(LeaveCreateSchema) },
  async ({ employeeId, ...input }, user) => {
    await addLeave(employeeId, input, user);
    refresh();
    return null;
  },
);
export const deleteLeaveAction = protectedAction({ permission: "manageEmployees", schema: z.object({ id }) }, async ({ id }, user) => {
  await deleteLeave(id, user);
  refresh();
  return null;
});

// customers + patients
export const updateCustomerAction = protectedAction({ permission: "manageCustomers", schema: CustomerUpdateSchema.extend({ id }) }, async ({ id, ...input }) => {
  await updateCustomer(id, input);
  refresh();
  return null;
});
export const updatePatientAction = protectedAction({ permission: "manageCustomers", schema: PatientUpdateSchema.extend({ id }) }, async ({ id, ...input }) => {
  await updatePatient(id, input);
  refresh();
  return null;
});

// users
export const createUserAction = protectedAction({ permission: "manageUsers", schema: UserCreateSchema }, async (input) => {
  const r = await createUser(input);
  refresh();
  return { id: r.id };
});
export const updateUserAction = protectedAction({ permission: "manageUsers", schema: UserUpdateSchema.extend({ id }) }, async ({ id, ...input }, user) => {
  await updateUser(id, input, user);
  refresh();
  return null;
});

// settings
export const updateSettingsAction = protectedAction({ permission: "manageSettings", schema: SettingsUpdateSchema }, async (input, user) => {
  await updateSettings(input, user);
  refresh();
  return null;
});
