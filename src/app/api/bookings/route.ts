import { BookingCreateSchema, BookingListQuery, createBooking, listBookings } from "@/features/bookings/service";
import { api, ok, readBody, readQuery } from "@/lib/api";

/**
 * GET /api/bookings?date=&from=&to=&status=pending,confirmed&customerId=&employeeId=&branchId=&q=&page=&pageSize=
 * (branch managers see only bookings assigned to their branch)
 */
export const GET = api({ permission: "viewReports" }, async ({ req, user }) => listBookings(readQuery(req, BookingListQuery), user));

/**
 * POST /api/bookings
 * { customerId, patientId, serviceDate, startTime?, locationType: "home"|"hospital",
 *   hospitalId?, wardRoom?, serviceAddress?, notes? }
 */
export const POST = api({ permission: "createBooking" }, async ({ req, user }) =>
  ok(await createBooking(await readBody(req, BookingCreateSchema), user), 201),
);
