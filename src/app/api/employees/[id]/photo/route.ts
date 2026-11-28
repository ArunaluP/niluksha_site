import { getEmployeePhoto } from "@/features/employees/service";
import { api, toId } from "@/lib/api";
import { NotFoundError } from "@/lib/errors";

/**
 * GET /api/employees/:id/photo   the employee's webcam photo (JPEG/PNG).
 * Pages add ?v=<last change> so a new photo is fetched; the same URL may be cached privately.
 */
export const GET = api<{ id: string }>({ permission: "viewMasterData" }, async ({ params, user }) => {
  const photo = await getEmployeePhoto(toId(params.id, "Employee"), user);
  if (!photo) throw new NotFoundError("Photo");
  return new Response(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.mime,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
