import { globalSearch } from "@/features/search/service";
import { api } from "@/lib/api";

/** GET /api/search?q=   sidebar search: up to 5 bookings, customers and employees the user may open */
export const GET = api({}, async ({ req, user }) => globalSearch(req.nextUrl.searchParams.get("q") ?? "", user));
