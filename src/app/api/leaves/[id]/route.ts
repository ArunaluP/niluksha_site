import { deleteLeave } from "@/features/employees/service";
import { api, toId } from "@/lib/api";

/** DELETE /api/leaves/:id   remove a leave record */
export const DELETE = api<{ id: string }>({ permission: "manageEmployees" }, async ({ params, user }) =>
  deleteLeave(toId(params.id, "Leave record"), user),
);
