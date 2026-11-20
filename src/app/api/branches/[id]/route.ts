import { BranchUpdateSchema, getBranch, updateBranch } from "@/features/branches/service";
import { api, readBody, toId } from "@/lib/api";

/** GET /api/branches/:id */
export const GET = api<{ id: string }>({ permission: "viewMasterData" }, async ({ params }) => getBranch(toId(params.id, "Branch")));

/** PATCH /api/branches/:id   (admin) */
export const PATCH = api<{ id: string }>({ permission: "manageBranches" }, async ({ req, params }) =>
  updateBranch(toId(params.id, "Branch"), await readBody(req, BranchUpdateSchema)),
);
