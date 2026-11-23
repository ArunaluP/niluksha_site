import { Package, Star } from "lucide-react";
import { EntityFormButton, type FieldDef } from "@/components/app/entity-form";
import { Card, EmptyState, money, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui";
import { listPackages } from "@/features/packages/service";
import { requirePermission } from "@/lib/dal";
import { createPackageAction, updatePackageAction } from "../_actions/records";

export const metadata = { title: "Packages · Care Booking" };

const FIELDS: FieldDef[] = [
  { name: "name", label: "Package name", required: true, full: true, placeholder: "e.g. Night shift 12 hours", maxLength: 80 },
  { name: "durationHours", label: "Hours (1–24)", type: "number", required: true, placeholder: "e.g. 12" },
  { name: "price", label: "Price (Rs.)", type: "number", required: true, placeholder: "e.g. 2500" },
  { name: "description", label: "Short description", full: true, placeholder: "Optional, shown when booking", maxLength: 255 },
  { name: "isDefault", label: "Default package (pre-selected on new bookings)", type: "checkbox", full: true },
  { name: "isActive", label: "Active (shown in the booking form)", type: "checkbox", editOnly: true, full: true },
];

export default async function PackagesPage() {
  await requirePermission("managePackages");
  const list = await listPackages();

  return (
    <div>
      <PageHeader
        title="Packages"
        subtitle="Care packages offered when booking: hours (up to 24) and a fixed price. Changing a package doesn't change bookings already made."
        actions={<EntityFormButton mode="create" title="Add package" fields={FIELDS} action={createPackageAction} success="Package added" buttonLabel="Add package" />}
      />
      <Card strong>
        {list.length === 0 ? (
          <EmptyState icon={<Package size={22} />} title="No packages yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Package</Th>
                <Th>Hours</Th>
                <Th className="text-right">Price</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className="hover:bg-white/50">
                  <Td className="min-w-[240px]">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
                        <Package size={15} />
                      </span>
                      <div>
                        <div className="flex items-center gap-2 font-medium">
                          {p.name}
                          {p.isDefault && (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100/80 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                              <Star size={11} /> Default
                            </span>
                          )}
                        </div>
                        {p.description && <div className="text-xs text-muted">{p.description}</div>}
                      </div>
                    </div>
                  </Td>
                  <Td>{p.durationHours} hours</Td>
                  <Td className="text-right font-medium whitespace-nowrap">{money(p.price)}</Td>
                  <Td>
                    <StatusBadge status={p.isActive ? "active" : "inactive"} />
                  </Td>
                  <Td className="text-right">
                    <EntityFormButton
                      mode="edit"
                      title={`Edit ${p.name}`}
                      fields={FIELDS}
                      initial={{ name: p.name, durationHours: String(p.durationHours), price: p.price, description: p.description ?? "", isDefault: p.isDefault, isActive: p.isActive }}
                      extra={{ id: p.id }}
                      action={updatePackageAction}
                      success="Package updated"
                      buttonSize="sm"
                      buttonVariant="ghost"
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
