import "server-only";
import { ValidationError } from "./errors";
import { nicConflicts, parseNic } from "./lk-rules";

/**
 * Server-side NIC rule for customers and employees:
 *  - no date of birth given but a valid NIC  -> fill the date of birth from the NIC
 *  - date of birth / gender given            -> must agree with the NIC
 * `saved` is the record as it is now (for updates), so a PATCH that sends only
 * one of the fields is still checked against the other.
 * Returns the date of birth to store (or undefined to leave it unchanged).
 */
export function checkAgainstNic(
  input: { nic?: string | null; dob?: string | null; gender?: string | null },
  saved?: { nic: string | null; dob: string | null; gender?: string | null },
): string | undefined {
  const nic = input.nic !== undefined ? input.nic : (saved?.nic ?? null);
  if (!nic) return undefined;
  const parsed = parseNic(nic);
  if ("error" in parsed) return undefined;

  // dob: explicitly sent wins; otherwise the saved one, unless the NIC itself changed
  const nicChanged = input.nic !== undefined && input.nic !== saved?.nic;
  const dob = input.dob !== undefined ? input.dob : nicChanged ? null : (saved?.dob ?? null);
  const gender = input.gender !== undefined ? input.gender : (saved?.gender ?? null);

  const e = nicConflicts({ nic, dob, gender });
  if (e.dob || e.gender) {
    throw new ValidationError(Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [v]])));
  }
  return dob ? undefined : parsed.dob; // fill the gap from the NIC
}
