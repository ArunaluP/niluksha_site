import type { FieldDef } from "@/components/app/entity-form";
import { DESIGNATIONS } from "@/db/schema";

export function employeeFields(branches: { id: number; name: string }[]): FieldDef[] {
  return [
    { name: "fullName", label: "Full name", required: true, full: true },
    { name: "designation", label: "Type", type: "select", required: true, options: DESIGNATIONS.map((d) => ({ value: d, label: d })) },
    { name: "branchId", label: "Branch", type: "select", required: true, numeric: true, options: branches.map((b) => ({ value: String(b.id), label: b.name })) },
    { name: "gender", label: "Gender", type: "radio", required: true, options: [{ value: "female", label: "Woman" }, { value: "male", label: "Man" }] },
    { name: "nic", label: "NIC", placeholder: "199012345678" },
    { name: "phone", label: "Phone", required: true, placeholder: "0771234567" },
    { name: "altPhone", label: "Other phone" },
    { name: "dob", label: "Date of birth", type: "date" },
    { name: "joinDate", label: "Join date", type: "date" },
    { name: "address", label: "Address", full: true },
    { name: "qualifications", label: "Qualifications / skills", type: "textarea", full: true },
    {
      name: "status",
      label: "Status",
      type: "select",
      required: true,
      editOnly: true,
      options: [
        { value: "active", label: "Active" },
        { value: "inactive", label: "Inactive (left / suspended)" },
      ],
    },
  ];
}
