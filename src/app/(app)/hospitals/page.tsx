import { Hospital } from "lucide-react";
import { EntityFormButton, type FieldDef } from "@/components/app/entity-form";
import { Tabs, withParams } from "@/components/app/list-tools";
import { Card, cn, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui";
import { HospitalListQuery, listHospitals } from "@/features/hospitals/service";
import { requirePermission } from "@/lib/dal";
import { hasPermission } from "@/lib/permissions";
import { createHospitalAction, updateHospitalAction } from "../_actions/records";

export const metadata = { title: "Hospitals · Care Booking" };

const FIELDS: FieldDef[] = [
  { name: "name", label: "Hospital name", required: true, full: true },
  {
    name: "type",
    label: "Type",
    type: "radio",
    required: true,
    options: [
      { value: "private", label: "Private" },
      { value: "government", label: "Government" },
    ],
    full: true,
  },
  { name: "city", label: "City" },
  { name: "phone", label: "Phone" },
  { name: "address", label: "Address", full: true },
  { name: "isActive", label: "Active (shown in booking form)", type: "checkbox", editOnly: true, full: true },
];

export default async function HospitalsPage({ searchParams }: PageProps<"/hospitals">) {
  const user = await requirePermission("viewMasterData");
  const raw = Object.fromEntries(Object.entries(await searchParams).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const parsed = HospitalListQuery.safeParse(raw);
  const list = await listHospitals(parsed.success ? parsed.data : {});
  const canEdit = hasPermission(user, "manageHospitals");

  return (
    <div>
      <PageHeader
        title="Hospitals"
        subtitle="Private and government hospitals where care sessions take place"
        actions={canEdit && <EntityFormButton mode="create" title="Add hospital" fields={FIELDS} initial={{ type: "private" }} action={createHospitalAction} success="Hospital added" buttonLabel="Add hospital" />}
      />
      <Card strong>
        <div className="border-b border-indigo-100/60 px-4 py-3">
          <Tabs
            items={[
              { href: withParams("/hospitals", raw, { type: undefined }), label: "All", active: !raw.type },
              { href: withParams("/hospitals", raw, { type: "private" }), label: "Private", active: raw.type === "private" },
              { href: withParams("/hospitals", raw, { type: "government" }), label: "Government", active: raw.type === "government" },
            ]}
          />
        </div>
        {list.length === 0 ? (
          <EmptyState icon={<Hospital size={22} />} title="No hospitals yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Hospital</Th>
                <Th>Type</Th>
                <Th>City</Th>
                <Th>Phone</Th>
                <Th>Status</Th>
                {canEdit && <Th />}
              </tr>
            </thead>
            <tbody>
              {list.map((h) => (
                <tr key={h.id} className="hover:bg-white/50">
                  <Td className="min-w-[220px]">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
                        <Hospital size={15} />
                      </span>
                      <div>
                        <div className="font-medium">{h.name}</div>
                        {h.address && <div className="text-xs text-muted">{h.address}</div>}
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <span className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", h.type === "private" ? "bg-sky-100/80 text-sky-800" : "bg-emerald-100/80 text-emerald-800")}>
                      {h.type === "private" ? "Private" : "Government"}
                    </span>
                  </Td>
                  <Td>{h.city ?? "—"}</Td>
                  <Td className="whitespace-nowrap">{h.phone ?? "—"}</Td>
                  <Td>
                    <StatusBadge status={h.isActive ? "active" : "inactive"} />
                  </Td>
                  {canEdit && (
                    <Td className="text-right">
                      <EntityFormButton
                        mode="edit"
                        title={`Edit ${h.name}`}
                        fields={FIELDS}
                        initial={{ name: h.name, type: h.type, city: h.city ?? "", phone: h.phone ?? "", address: h.address ?? "", isActive: h.isActive }}
                        extra={{ id: h.id }}
                        action={updateHospitalAction}
                        success="Hospital updated"
                        buttonSize="sm"
                        buttonVariant="ghost"
                      />
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
