import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { hospitals } from "@/db/schema";
import { getCustomer } from "@/features/customers/service";
import { requirePermission } from "@/lib/dal";
import { today } from "@/lib/dates";
import { listPackages } from "@/features/packages/service";
import { BookingWizard } from "./booking-wizard";

export const metadata = { title: "New booking · Care Booking" };

export default async function NewBookingPage({ searchParams }: PageProps<"/bookings/new">) {
  await requirePermission("createBooking");
  const sp = await searchParams;
  const customerId = Number(sp.customerId);

  const [hospitalList, packageList, preselected] = await Promise.all([
    db.select({ id: hospitals.id, name: hospitals.name, type: hospitals.type, city: hospitals.city }).from(hospitals).where(eq(hospitals.isActive, true)).orderBy(asc(hospitals.name)),
    listPackages({ active: true }),
    Number.isInteger(customerId) && customerId > 0 ? getCustomer(customerId).catch(() => null) : null,
  ]);

  return <BookingWizard hospitals={hospitalList} packages={packageList.map((p) => ({ id: p.id, name: p.name, durationHours: p.durationHours, price: p.price, description: p.description, isDefault: p.isDefault }))} today={today()} initialCustomer={preselected ? JSON.parse(JSON.stringify(preselected)) : null} />;
}
