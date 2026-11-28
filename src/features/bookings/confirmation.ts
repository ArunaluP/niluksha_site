import "server-only";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookingLinks, bookings, branches, customers, employees, hospitals, patients } from "@/db/schema";
import { money, niceDate, nicePeriod, niceTime } from "@/components/ui";
import type { CurrentUser } from "@/lib/dal";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { hospitalPlace, waDigits, whatsappNumberOf } from "@/lib/lk-rules";
import { canAccessBooking } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { hashToken, isTokenShaped, LINK_DAYS, linkState, newToken, publicBaseUrl, summarizeLinks } from "@/lib/share-link";

/**
 * Booking confirmation for the customer: the printed sheet, the PDF,
 * and the WhatsApp message with a secret 7-day link (like invoices).
 * The amount is an ESTIMATE (package price × days); the invoice is the final bill.
 */

/** Everything on the confirmation, with no permission check (see getBookingConfirmation). */
export async function loadBookingConfirmation(bookingId: number) {
  const [row] = await db
    .select({
      id: bookings.id,
      bookingNo: bookings.bookingNo,
      status: bookings.status,
      bookedOn: bookings.createdAt,
      serviceDate: bookings.serviceDate,
      days: bookings.days,
      endDate: bookings.endDate,
      startTime: bookings.startTime,
      packageName: bookings.packageName,
      durationHours: bookings.durationHours,
      rate: bookings.rate,
      locationType: bookings.locationType,
      hospitalName: hospitals.name,
      wardNo: bookings.wardNo,
      bedNo: bookings.bedNo,
      serviceAddress: bookings.serviceAddress,
      notes: bookings.notes,
      branchId: bookings.branchId,
      branchName: branches.name,
      customerId: customers.id,
      customerNo: customers.customerNo,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      customerAltPhone: customers.altPhone,
      customerAddress: customers.address,
      phoneWhatsapp: customers.phoneWhatsapp,
      altPhoneWhatsapp: customers.altPhoneWhatsapp,
      whatsappPhone: customers.whatsappPhone,
      patientName: patients.fullName,
      patientNo: patients.patientNo,
      employeeName: employees.fullName,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(patients, eq(patients.id, bookings.patientId))
    .leftJoin(hospitals, eq(hospitals.id, bookings.hospitalId))
    .leftJoin(employees, eq(employees.id, bookings.employeeId))
    .leftJoin(branches, eq(branches.id, bookings.branchId))
    .where(eq(bookings.id, bookingId));
  if (!row) return null;
  const s = await getSettings();
  const company = { name: s.company_name ?? "", address: s.company_address ?? "", phone: s.company_phone ?? "" };
  const estimate = (Number(row.rate) * row.days).toFixed(2);
  const whatsappNumber = whatsappNumberOf({ phone: row.customerPhone, altPhone: row.customerAltPhone, phoneWhatsapp: row.phoneWhatsapp, altPhoneWhatsapp: row.altPhoneWhatsapp, whatsappPhone: row.whatsappPhone });
  return { ...row, estimate, company, whatsappNumber };
}
export type BookingConfirmation = NonNullable<Awaited<ReturnType<typeof loadBookingConfirmation>>>;

/** Same, for staff: branch managers see unassigned bookings and their own branch's. */
export async function getBookingConfirmation(bookingId: number, user: CurrentUser) {
  const b = await loadBookingConfirmation(bookingId);
  if (!b || !canAccessBooking(user, b.branchId)) throw new NotFoundError("Booking");
  return b;
}

/** One short line for the customer about where the booking is now. */
export function statusLine(b: Pick<BookingConfirmation, "status" | "employeeName">) {
  switch (b.status) {
    case "pending":
      return "We have received your booking. Our team will call you to confirm it.";
    case "confirmed":
      return "Your booking is confirmed. We will let you know your caregiver soon.";
    case "assigned":
      return `Your booking is confirmed${b.employeeName ? ` and ${b.employeeName} will be your caregiver` : ""}.`;
    case "delivered":
    case "invoice_printed":
      return "This care service has been completed. Thank you.";
    default:
      return "This booking has been cancelled.";
  }
}

export const STATUS_TITLE: Record<string, string> = {
  pending: "Received — waiting for confirmation",
  confirmed: "Confirmed",
  assigned: "Confirmed — caregiver assigned",
  delivered: "Completed",
  invoice_printed: "Completed",
  ignored: "Cancelled",
};

export const placeOf = (b: Pick<BookingConfirmation, "locationType" | "hospitalName" | "wardNo" | "bedNo" | "serviceAddress">, sep?: string) =>
  b.locationType === "hospital" ? hospitalPlace(b.hospitalName, b.wardNo, b.bedNo, sep) : b.serviceAddress;

/** The WhatsApp message: every detail of the booking, then the link (when the app has a public address). */
export function bookingMessage(b: BookingConfirmation, link: { url: string } | null) {
  const where = placeOf(b);
  const lines: (string | null)[] = [
    `Dear ${b.customerName},`,
    "",
    `Thank you for booking with ${b.company.name || "us"}.`,
    statusLine(b),
    "",
    `📋 Booking: ${b.bookingNo}`,
    b.days > 1
      ? `📅 Service: ${nicePeriod(b.serviceDate, b.days)} (${b.days} days), from ${niceTime(b.startTime)}`
      : `📅 Service date: ${niceDate(b.serviceDate)}, ${niceTime(b.startTime)}`,
    `👤 Patient: ${b.patientName}`,
    `📦 Package: ${b.packageName || `${b.durationHours}-hour care session`}`,
    where ? `📍 ${b.locationType === "hospital" ? "Hospital" : "Home"}: ${where}` : null,
    b.status === "assigned" && b.employeeName ? `🧑‍⚕️ Caregiver: ${b.employeeName}` : null,
    b.days > 1 ? `💰 Estimated amount: ${money(b.rate)} × ${b.days} days = ${money(b.estimate)}` : `💰 Estimated amount: ${money(b.estimate)}`,
    "(The final amount is on your invoice.)",
  ];
  if (link) lines.push("", `View / download your booking (link valid for ${LINK_DAYS} days):`, link.url);
  if (b.company.phone) lines.push("", `To change or cancel, please call ${b.company.phone}.`);
  lines.push("", "Thank you.");
  return lines.filter((l) => l !== null).join("\n");
}

// ---------------------------------------------------------------- links
async function createLink(bookingId: number, user: CurrentUser, base: string) {
  const { token, tokenHash, expiresAt } = newToken();
  await db.insert(bookingLinks).values({ bookingId, tokenHash, expiresAt, createdBy: user.id });
  return { url: `${base}/b/${token}`, expiresAt };
}

export async function bookingLinkSummary(bookingId: number) {
  return summarizeLinks(await db.select().from(bookingLinks).where(eq(bookingLinks.bookingId, bookingId)).orderBy(desc(bookingLinks.id)));
}

/** The booking behind a working link (null if the link doesn't work). */
export async function bookingForToken(token: string, opts: { countView?: boolean } = {}) {
  if (!isTokenShaped(token)) return { state: "missing" as const, booking: null, expiresAt: null };
  const [link] = await db.select().from(bookingLinks).where(eq(bookingLinks.tokenHash, hashToken(token)));
  const state = linkState(link);
  if (state !== "ok" || !link) return { state, booking: null, expiresAt: link?.expiresAt ?? null };
  const booking = await loadBookingConfirmation(link.bookingId);
  if (!booking) return { state: "missing" as const, booking: null, expiresAt: null };
  if (opts.countView) {
    await db
      .update(bookingLinks)
      .set({ views: sql`${bookingLinks.views} + 1`, lastViewedAt: new Date() })
      .where(eq(bookingLinks.id, link.id));
  }
  return { state: "ok" as const, booking, expiresAt: link.expiresAt };
}

/** "Disable links": every link of this booking stops working now. */
export async function disableBookingLinks(bookingId: number, user: CurrentUser) {
  await getBookingConfirmation(bookingId, user); // branch check
  await db
    .update(bookingLinks)
    .set({ disabledAt: new Date() })
    .where(and(eq(bookingLinks.bookingId, bookingId), isNull(bookingLinks.disabledAt), gt(bookingLinks.expiresAt, new Date())));
  return bookingLinkSummary(bookingId);
}

/**
 * "Send on WhatsApp": makes a new 7-day link and the message, and the wa.me
 * address that opens WhatsApp with the customer's number and the message filled in.
 */
export async function prepareWhatsappBooking(bookingId: number, user: CurrentUser) {
  const b = await getBookingConfirmation(bookingId, user);
  if (b.status === "ignored") throw new ConflictError(`${b.bookingNo} was cancelled, so it can't be sent.`);
  if (!b.whatsappNumber) throw new ConflictError("This customer has no WhatsApp number. Add one in the customer's profile.");

  const base = await publicBaseUrl();
  const link = base ? await createLink(bookingId, user, base) : null;
  const message = bookingMessage(b, link);
  return {
    number: b.whatsappNumber,
    message,
    waUrl: `https://wa.me/${waDigits(b.whatsappNumber)}?text=${encodeURIComponent(message)}`,
    link: link ? { url: link.url, expiresAt: link.expiresAt.toISOString() } : null,
    summary: await bookingLinkSummary(bookingId),
  };
}
