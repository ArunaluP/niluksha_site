"use client";

import { CheckCircle2, CloudUpload, ExternalLink, FolderOpen, TriangleAlert, Unplug } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { disconnectDriveAction, setDriveFolderAction } from "@/app/(app)/_actions/drive";
import { Button, buttonClass, Field, Input } from "@/components/ui";

type Status = {
  serverConfigured: boolean;
  connected: boolean;
  ready: boolean;
  accountEmail?: string;
  folderName?: string | null;
  folderLink?: string | null;
  lastError?: string | null;
  connectedByName?: string | null;
};

/** Settings → Google Drive: connect once, paste the folder link, see the state. */
export function DriveCard({ status }: { status: Status }) {
  const [link, setLink] = useState(status.folderLink ?? "");
  const [err, setErr] = useState<string | undefined>();
  const [pending, start] = useTransition();
  const router = useRouter();
  const sp = useSearchParams();

  // Result of the Google round-trip (?drive=connected / ?drive=error&msg=…), shown once.
  useEffect(() => {
    const d = sp.get("drive");
    if (!d) return;
    if (d === "connected") toast.success(`Google Drive connected (${sp.get("account") ?? ""}). Now paste the folder link.`);
    else toast.error(sp.get("msg") ?? "Couldn't connect Google Drive.");
    router.replace("/settings", { scroll: false });
  }, [sp, router]);

  if (!status.serverConfigured) {
    return (
      <div className="flex gap-3 rounded-xl bg-amber-50/90 px-4 py-3 text-sm text-amber-900">
        <TriangleAlert size={18} className="mt-0.5 shrink-0" />
        <div>
          Google Drive isn&apos;t set up on the server yet. Add <code className="font-mono">GOOGLE_CLIENT_ID</code> and{" "}
          <code className="font-mono">GOOGLE_CLIENT_SECRET</code> to <code className="font-mono">.env.local</code> and restart the app. Step-by-step:{" "}
          <code className="font-mono">docs/GOOGLE_DRIVE_SETUP.md</code>.
        </div>
      </div>
    );
  }

  if (!status.connected) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-md text-sm text-muted">
          Connect the company Google account once. Staff can then save exported Excel reports straight into a Drive folder; they never sign in to Google
          themselves.
        </p>
        <a href="/api/google/connect" className={buttonClass("primary")}>
          <CloudUpload size={16} /> Connect Google Drive
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 text-sm">
          {status.ready ? <CheckCircle2 size={18} className="text-emerald-600" /> : <TriangleAlert size={18} className="text-amber-600" />}
          <div>
            <div className="font-medium">
              Connected as {status.accountEmail}
              {status.connectedByName ? <span className="font-normal text-muted"> · by {status.connectedByName}</span> : null}
            </div>
            <div className="text-xs text-muted">
              {status.ready ? (
                <>
                  Exports go to <b className="font-medium text-ink">{status.folderName}</b> → a folder per month (e.g. 2026-11)
                </>
              ) : (
                "Not ready: paste a folder link below."
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <a href="/api/google/connect" className={buttonClass("ghost", "sm")}>
            Reconnect
          </a>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (!confirm("Disconnect Google Drive? Exports will only be downloadable until it's connected again.")) return;
              start(async () => {
                const r = await disconnectDriveAction({});
                if (!r.ok) return void toast.error(r.error);
                toast.success("Google Drive disconnected");
                router.refresh();
              });
            }}
          >
            <Unplug size={15} /> Disconnect
          </Button>
        </div>
      </div>

      {status.lastError && (
        <div className="flex gap-2 rounded-xl bg-rose-50/90 px-4 py-3 text-sm text-rose-700">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" /> {status.lastError}
        </div>
      )}

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await setDriveFolderAction({ folderLink: link });
            if (!r.ok) {
              setErr(r.fieldErrors?.folderLink?.[0] ?? r.error);
              return void toast.error(r.fieldErrors?.folderLink?.[0] ?? r.error);
            }
            setErr(undefined);
            toast.success(`Exports will be saved in "${r.data.folderName}"`);
            router.refresh();
          });
        }}
      >
        <Field label="Drive folder link" error={err} hint="Open the folder in Google Drive and copy the address from the browser, or Share → Copy link." className="min-w-0 flex-1">
          <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" />
        </Field>
        <Button disabled={pending} className="mb-[22px]">
          <FolderOpen size={15} /> Save folder
        </Button>
        {status.folderLink && (
          <a href={status.folderLink} target="_blank" rel="noreferrer" className={buttonClass("ghost", "md", "mb-[22px]")}>
            <ExternalLink size={15} /> Open
          </a>
        )}
      </form>
    </div>
  );
}
