import { CloudUpload, ExternalLink, MonitorDown, Package } from "lucide-react";
import { Card, CardHeader, LinkButton, niceDateTime, PageHeader } from "@/components/ui";
import { getDriveStatus } from "@/features/drive/service";
import { recentExports } from "@/features/exports/service";
import { requirePermission } from "@/lib/dal";
import { getSettings } from "@/lib/settings";
import { DriveCard } from "./drive-card";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Settings · Care Booking" };

const REPORT_LABEL = { activity: "Customer report", employees: "Employee report", employee: "One employee" } as const;

export default async function SettingsPage() {
  await requirePermission("manageSettings");
  const [s, drive, exports] = await Promise.all([getSettings(), getDriveStatus(), recentExports(10)]);
  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="Settings" subtitle="Company details, Google Drive for report exports" />
      <Card strong className="p-6">
        <SettingsForm
          initial={{
            company_name: s.company_name ?? "",
            company_name_si: s.company_name_si ?? "",
            company_address: s.company_address ?? "",
            company_phone: s.company_phone ?? "",
            public_base_url: s.public_base_url ?? "",
          }}
        />
      </Card>

      <Card strong>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <CloudUpload size={17} className="text-accent" /> Google Drive (report exports)
            </span>
          }
          subtitle="Excel exports can be saved straight into this folder. Director and call center can save; branch managers download only."
        />
        <div className="px-5 pb-5">
          <DriveCard
            status={{
              serverConfigured: drive.serverConfigured,
              connected: drive.connected,
              ready: drive.ready,
              accountEmail: drive.accountEmail,
              folderName: drive.folderName,
              folderLink: drive.folderLink,
              lastError: drive.lastError,
              connectedByName: drive.connectedByName,
            }}
          />
        </div>
      </Card>

      <Card strong>
        <CardHeader title="Recent exports" subtitle="The last 10 Excel exports, by anyone" />
        {exports.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted">No exports yet.</p>
        ) : (
          <ul className="divide-y divide-indigo-100/70 px-5 pb-3">
            {exports.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium" title={e.fileName}>
                    {e.fileName}
                  </div>
                  <div className="text-xs text-muted">
                    {REPORT_LABEL[e.report]} · {e.rowsCount} rows · {e.userName} · {niceDateTime(e.createdAt)}
                    {e.status === "failed" && <span className="text-rose-600"> · Drive upload failed: {e.error}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-muted">
                  {e.destination !== "drive" && (
                    <span className="inline-flex items-center gap-1" title="Downloaded">
                      <MonitorDown size={14} />
                    </span>
                  )}
                  {e.driveLink && (
                    <a href={e.driveLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                      Drive <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex items-center justify-between gap-4 p-5">
        <div>
          <div className="font-medium">Prices and session lengths</div>
          <div className="text-sm text-muted">These are set per package, e.g. &quot;Standard 24 hours – Rs. 4,500&quot;.</div>
        </div>
        <LinkButton href="/packages" variant="secondary">
          <Package size={15} /> Packages
        </LinkButton>
      </Card>
    </div>
  );
}
