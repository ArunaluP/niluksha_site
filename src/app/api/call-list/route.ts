import { CallListQuery, getCallList } from "@/features/bookings/service";
import { api, readQuery } from "@/lib/api";

/** GET /api/call-list?day=today|tomorrow&date=YYYY-MM-DD&view=pending|done|all */
export const GET = api({ permission: "useCallList" }, async ({ req }) => getCallList(readQuery(req, CallListQuery)));
