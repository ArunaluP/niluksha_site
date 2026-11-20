import { Card, money, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/dal";
import { getSettings } from "@/lib/settings";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Settings · Care Booking" };

export default async function SettingsPage() {
  await requirePermission("manageSettings");
  const s = await getSettings();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" subtitle="Company details for invoices and the price of a session" />
      <Card strong className="p-6">
        <SettingsForm
          initial={{
            company_name: s.company_name ?? "",
            company_address: s.company_address ?? "",
            company_phone: s.company_phone ?? "",
            session_rate: s.session_rate ?? "4500.00",
          }}
        />
      </Card>
      <p className="mt-3 text-xs text-muted">
        Current rate: {money(s.session_rate)} per 24-hour session. A new rate applies to bookings created after you save; existing bookings keep their rate.
      </p>
    </div>
  );
}
