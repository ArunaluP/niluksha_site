import "server-only";
import { eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { bookings, bookingStatusLogs, type Booking, type BookingStatus } from "@/db/schema";
import type { CurrentUser } from "@/lib/dal";
import { ConflictError, NotFoundError } from "@/lib/errors";

/**
 * The booking life cycle — the ONLY place status rules live.
 *
 *   pending ──confirm──▶ confirmed ──assign──▶ assigned ──deliver──▶ delivered ──markPrinted──▶ invoice_printed
 *      │                    │  ▲                  │  │
 *      │                    │  └────unassign──────┘  └─assign (reassign to another employee)
 *      └──────ignore────────┴────────ignore───────┘──▶ ignored
 */
export const TRANSITIONS = {
  confirm: { from: ["pending"], to: "confirmed" },
  ignore: { from: ["pending", "confirmed", "assigned"], to: "ignored" },
  assign: { from: ["confirmed", "assigned"], to: "assigned" },
  unassign: { from: ["assigned"], to: "confirmed" },
  deliver: { from: ["assigned"], to: "delivered" },
  markPrinted: { from: ["delivered"], to: "invoice_printed" },
} as const satisfies Record<string, { from: readonly BookingStatus[]; to: BookingStatus }>;

export type BookingAction = keyof typeof TRANSITIONS;

const ACTION_LABELS: Record<BookingAction, string> = {
  confirm: "confirm",
  ignore: "ignore",
  assign: "assign an employee to",
  unassign: "unassign",
  deliver: "mark as delivered",
  markPrinted: "mark the invoice printed for",
};

/** Locks the booking row for the rest of the transaction (no two users change it at once). */
export async function lockBooking(tx: Tx, bookingId: number): Promise<Booking> {
  const [row] = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).for("update");
  if (!row) throw new NotFoundError("Booking");
  return row;
}

export function assertCan(booking: Booking, action: BookingAction) {
  const rule = TRANSITIONS[action];
  if (!(rule.from as readonly BookingStatus[]).includes(booking.status)) {
    throw new ConflictError(
      `Cannot ${ACTION_LABELS[action]} booking ${booking.bookingNo}: it is ${booking.status.replace("_", " ")}. ` +
        `Allowed only when ${rule.from.join(" / ").replaceAll("_", " ")}.`,
    );
  }
}

/**
 * Applies a status change inside a transaction:
 * checks the rule, updates the booking (+ extra columns) and writes the history log.
 */
export async function applyTransition(
  tx: Tx,
  booking: Booking,
  action: BookingAction,
  user: CurrentUser,
  extra: Partial<typeof bookings.$inferInsert> = {},
  note?: string,
) {
  assertCan(booking, action);
  const to = TRANSITIONS[action].to;
  await tx
    .update(bookings)
    .set({ ...extra, status: to })
    .where(eq(bookings.id, booking.id));
  await tx.insert(bookingStatusLogs).values({
    bookingId: booking.id,
    fromStatus: booking.status,
    toStatus: to,
    userId: user.id,
    employeeId: action === "assign" ? (extra.employeeId ?? null) : null,
    note: note ?? null,
  });
}
