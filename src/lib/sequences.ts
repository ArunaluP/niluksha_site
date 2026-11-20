import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { sequences } from "@/db/schema";
import { currentYear } from "./dates";

/**
 * Readable running numbers: CUS-00001, BK-2026-00001, INV-2026-00001 …
 * MUST be called inside db.transaction(): the row is locked (FOR UPDATE)
 * so two users saving at the same moment never get the same number.
 */
const FORMATS = {
  customer: { prefix: "CUS", yearly: false, digits: 5 },
  patient: { prefix: "PAT", yearly: false, digits: 5 },
  employee: { prefix: "EMP", yearly: false, digits: 4 },
  booking: { prefix: "BK", yearly: true, digits: 5 },
  invoice: { prefix: "INV", yearly: true, digits: 5 },
} as const;

export type SequenceName = keyof typeof FORMATS;

export async function nextNumber(tx: Tx, name: SequenceName): Promise<string> {
  const fmt = FORMATS[name];
  const year = fmt.yearly ? currentYear() : 0;

  // Make sure the counter row exists (does nothing if it already does).
  await tx.insert(sequences).values({ name, year, lastValue: 0 }).onDuplicateKeyUpdate({ set: { name: sql`name` } });

  const [row] = await tx
    .select({ lastValue: sequences.lastValue })
    .from(sequences)
    .where(and(eq(sequences.name, name), eq(sequences.year, year)))
    .for("update");

  const next = (row?.lastValue ?? 0) + 1;
  await tx
    .update(sequences)
    .set({ lastValue: next })
    .where(and(eq(sequences.name, name), eq(sequences.year, year)));

  const num = String(next).padStart(fmt.digits, "0");
  return fmt.yearly ? `${fmt.prefix}-${year}-${num}` : `${fmt.prefix}-${num}`;
}
