"use client";

import { CheckCircle2, CloudUpload, Download, ExternalLink, FileSpreadsheet, Loader2, MonitorDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button, cn } from "@/components/ui";
import { Dialog } from "@/components/ui/client";

type Destination = "download" | "drive" | "both";
export type DriveInfo = { ready: boolean; canSave: boolean; folderName: string | null; connected: boolean };

const KEY = "cb-export-destination";

/**
 * "Excel" button → pop-up: download to this computer, save to the company
 * Google Drive, or both. Sends the page's filters; the server builds the file.
 */
export function ExportButton({
  report,
  filters,
  empNo,
  drive,
}: {
  report: "activity" | "employees" | "employee";
  filters: Record<string, string | undefined>;
  empNo?: string;
  drive: DriveInfo;
}) {
  const driveOk = drive.ready && drive.canSave;
  const [open, setOpen] = useState(false);
  const [dest, setDest] = useState<Destination>("download");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ fileName: string; link: string | null; downloaded: boolean; driveError: string | null } | null>(null);

  /** The last choice on this computer, if it's still possible. */
  function savedChoice(): Destination {
    try {
      const saved = localStorage.getItem(KEY) as Destination | null;
      if (saved === "download" || (driveOk && (saved === "drive" || saved === "both"))) return saved;
    } catch {}
    return "download";
  }

  const driveReason = !drive.canSave
    ? "Your role can download reports only."
    : !drive.connected
      ? "Google Drive isn't connected. The Director can connect it in Settings."
      : !drive.ready
        ? "Google Drive needs attention in Settings (folder missing or access removed)."
        : null;

  async function run() {
    setBusy(true);
    try {
      const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== "")) as Record<string, string>;
      const res = await fetch("/api/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report, destination: dest, filters: clean, empNo }),
      });
      const json = await res.json();
      if (!json.ok) {
        toast.error(json.fieldErrors?.destination?.[0] ?? json.fieldErrors?.filters?.[0] ?? json.error ?? "Export failed.");
        return;
      }
      const d = json.data as { fileName: string; mimeType: string; file: string | null; drive: { link: string } | null; driveError: string | null };
      if (d.file) {
        const bytes = Uint8Array.from(atob(d.file), (c) => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: d.mimeType }));
        const a = document.createElement("a");
        a.href = url;
        a.download = d.fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
      try {
        localStorage.setItem(KEY, dest);
      } catch {}
      setDone({ fileName: d.fileName, link: d.drive?.link ?? null, downloaded: Boolean(d.file), driveError: d.driveError });
      if (d.driveError) toast.error(`Downloaded, but not saved to Drive: ${d.driveError}`);
      else toast.success(d.drive ? "Saved to Google Drive" : "Excel downloaded");
    } catch {
      toast.error("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setDone(null);
          setDest(savedChoice());
          setOpen(true);
        }}
      >
        <FileSpreadsheet size={16} /> Excel
      </Button>
      <Dialog open={open} onClose={() => !busy && setOpen(false)} title="Export to Excel" subtitle="Every row of this report with the current filters.">
        {done ? (
          <div className="space-y-4">
            <div className="flex gap-3 rounded-xl bg-emerald-50/90 px-4 py-3 text-sm text-emerald-800">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="font-medium break-words">{done.fileName}</div>
                <div className="text-emerald-700/90">
                  {[done.downloaded && "Downloaded to this computer", done.link && "Saved to Google Drive"].filter(Boolean).join(" · ")}
                </div>
              </div>
            </div>
            {done.driveError && <div className="rounded-xl bg-rose-50/90 px-4 py-3 text-sm text-rose-700">Not saved to Drive: {done.driveError}</div>}
            <div className="flex justify-end gap-2">
              {done.link && (
                <a href={done.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-accent hover:bg-white/70">
                  <ExternalLink size={15} /> Open in Google Drive
                </a>
              )}
              <Button onClick={() => setOpen(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Choice active={dest === "download"} onClick={() => setDest("download")} icon={<MonitorDown size={20} />} title="Download to this computer" text="The .xlsx file goes to your Downloads folder." />
            <Choice
              active={dest === "drive"}
              disabled={!driveOk}
              onClick={() => setDest("drive")}
              icon={<CloudUpload size={20} />}
              title="Save to Google Drive"
              text={driveOk ? `Into "${drive.folderName}" → a folder for the month.` : (driveReason ?? "")}
            />
            <Choice
              active={dest === "both"}
              disabled={!driveOk}
              onClick={() => setDest("both")}
              icon={<Download size={20} />}
              title="Both"
              text={driveOk ? "Download it and save a copy to Google Drive." : (driveReason ?? "")}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={run} disabled={busy}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
                {busy ? (dest === "download" ? "Preparing…" : "Uploading…") : "Export"}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}

function Choice({ active, disabled, onClick, icon, title, text }: { active: boolean; disabled?: boolean; onClick: () => void; icon: ReactNode; title: string; text: string }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition",
        active ? "border-accent/60 bg-accent-soft/70 ring-2 ring-accent/30" : "border-white/80 bg-white/50 hover:bg-white/80",
        disabled && "cursor-not-allowed opacity-50 hover:bg-white/50",
      )}
    >
      <span className={cn("mt-0.5", active ? "text-accent" : "text-muted")}>{icon}</span>
      <span>
        <span className="block font-medium text-ink">{title}</span>
        <span className="block text-xs text-muted">{text}</span>
      </span>
    </button>
  );
}
