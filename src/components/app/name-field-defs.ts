import type { FieldDef } from "@/components/app/entity-form";
import { NAME_LIMITS } from "@/lib/lk-rules";

/** First / middle / last name as three fields in one row of an EntityForm. */
export const NAME_FIELD_DEFS: FieldDef[] = [
  { name: "firstName", label: "First name", required: true, third: true, placeholder: "e.g. Nimali", maxLength: NAME_LIMITS.firstName },
  { name: "middleName", label: "Middle name", third: true, placeholder: "Optional", maxLength: NAME_LIMITS.middleName },
  { name: "lastName", label: "Last name", required: true, third: true, placeholder: "e.g. Perera", maxLength: NAME_LIMITS.lastName },
];

/** Initial values for the three name fields from a saved record. */
export const nameInitial = (r: { firstName: string; middleName: string | null; lastName: string }) => ({
  firstName: r.firstName,
  middleName: r.middleName ?? "",
  lastName: r.lastName,
});
