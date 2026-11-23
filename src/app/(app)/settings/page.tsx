import { Package } from "lucide-react";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/dal";
import { getSettings } from "@/lib/settings";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Settings · Care Booking" };

export default async function SettingsPage() {
  await requirePermission("manageSettings");
  const s = await getSettings();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" subtitle="Company details shown on invoices" />
      <Card strong className="p-6">
        <SettingsForm
          initial={{
            company_name: s.company_name ?? "",
            company_address: s.company_address ?? "",
            company_phone: s.company_phone ?? "",
          }}
        />
      </Card>
      <Card className="mt-4 flex items-center justify-between gap-4 p-5">
        <div>
          <div className="font-medium">Prices and session lengths</div>
          <div className="text-sm text-muted">These are set per package, e.g. "Standard 24 hours – Rs. 4,500".</div>
        </div>
        <LinkButton href="/packages" variant="secondary">
          <Package size={15} /> Packages
        </LinkButton>
      </Card>
    </div>
  );
}
