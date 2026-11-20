import { BranchCreateSchema, BranchListQuery, createBranch, listBranches } from "@/features/branches/service";
import { api, ok, readBody, readQuery } from "@/lib/api";

/** GET /api/branches?search=&active= */
export const GET = api({ permission: "viewMasterData" }, async ({ req }) => listBranches(readQuery(req, BranchListQuery)));

/** POST /api/branches   { code, name, address?, phone?, managerUserId? }   (admin) */
export const POST = api({ permission: "manageBranches" }, async ({ req }) =>
  ok(await createBranch(await readBody(req, BranchCreateSchema)), 201),
);
