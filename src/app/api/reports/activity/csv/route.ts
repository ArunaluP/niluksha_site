import { activityCsv } from "@/features/reports/csv";
import { listActivityEvents, ReportQuery } from "@/features/reports/service";
import { api, readQuery } from "@/lib/api";

/**
 * GET /api/reports/activity/csv?from=&to=&event=&branchId=
 * Same filters and rules as /api/reports/activity; every event, no paging.
 */
export const GET = api({ permission: "viewReports" }, async ({ req, user }) => {
  const q = readQuery(req, ReportQuery);
  const { items } = await listActivityEvents(user, q, { all: true });
  return new Response(activityCsv(items), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="activity_${q.from}_to_${q.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
