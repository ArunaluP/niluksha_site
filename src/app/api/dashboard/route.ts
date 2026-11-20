import * as z from "zod";
import { getDashboard } from "@/features/dashboard/service";
import { api, readQuery } from "@/lib/api";
import { today } from "@/lib/dates";
import { isoDate } from "@/lib/validation";

/** GET /api/dashboard?date=YYYY-MM-DD   (default today; branch managers: own branch) */
export const GET = api({}, async ({ req, user }) => {
  const { date } = readQuery(req, z.object({ date: isoDate.optional() }));
  return getDashboard(date ?? today(), user);
});
