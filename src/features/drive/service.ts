import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleDriveConnection, users } from "@/db/schema";
import type { CurrentUser } from "@/lib/dal";
import { AppError, ValidationError } from "@/lib/errors";
import { hasPermission } from "@/lib/permissions";
import { open, seal } from "@/lib/secret-box";

/**
 * Google Drive for report exports ("Option A"):
 * the Director clicks "Connect Google Drive" once in Settings, signs in to Google
 * and allows access. Google returns a refresh token; we keep it encrypted and use
 * it to upload exported Excel files into the folder the Director pasted.
 * Staff never sign in to Google; the app's own login is unchanged.
 *
 * Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local
 * (see docs/GOOGLE_DRIVE_SETUP.md). No Google SDK: plain HTTPS calls.
 */

// Endpoints. GOOGLE_API_BASE is ONLY for automated tests (a fake Google); never set it in real use.
const TEST_BASE = process.env.GOOGLE_API_BASE?.replace(/\/$/, "");
const URLS = {
  auth: TEST_BASE ? `${TEST_BASE}/o/oauth2/v2/auth` : "https://accounts.google.com/o/oauth2/v2/auth",
  token: TEST_BASE ? `${TEST_BASE}/token` : "https://oauth2.googleapis.com/token",
  revoke: TEST_BASE ? `${TEST_BASE}/revoke` : "https://oauth2.googleapis.com/revoke",
  userinfo: TEST_BASE ? `${TEST_BASE}/oauth2/v3/userinfo` : "https://openidconnect.googleapis.com/v1/userinfo",
  files: TEST_BASE ? `${TEST_BASE}/drive/v3/files` : "https://www.googleapis.com/drive/v3/files",
  upload: TEST_BASE ? `${TEST_BASE}/upload/drive/v3/files` : "https://www.googleapis.com/upload/drive/v3/files",
};

/** drive = write into a folder the Director picks; email = show which account is connected. */
const SCOPES = ["https://www.googleapis.com/auth/drive", "openid", "email"];
const FOLDER_MIME = "application/vnd.google-apps.folder";

export function driveConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function credentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new AppError("Google Drive isn't set up on the server yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local (see docs/GOOGLE_DRIVE_SETUP.md).");
  }
  return { clientId, clientSecret };
}

/**
 * Where Google sends the Director back after "Allow". Must be listed EXACTLY in the
 * Google Cloud OAuth client. GOOGLE_REDIRECT_URI wins; otherwise the address the
 * browser used (works for http://localhost:3000 and a fixed domain).
 */
export function redirectUri(origin: string) {
  return process.env.GOOGLE_REDIRECT_URI || `${origin.replace(/\/$/, "")}/api/google/callback`;
}

export function authUrl(state: string, origin: string) {
  const { clientId } = credentials();
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline", // → refresh token
    prompt: "consent", // always return a refresh token, even on reconnect
    include_granted_scopes: "true",
    state,
  });
  return `${URLS.auth}?${p}`;
}

// ------------------------------------------------------------------ connection row
export async function getDriveStatus() {
  const [row] = await db
    .select({
      accountEmail: googleDriveConnection.accountEmail,
      folderId: googleDriveConnection.folderId,
      folderName: googleDriveConnection.folderName,
      folderLink: googleDriveConnection.folderLink,
      lastError: googleDriveConnection.lastError,
      connectedAt: googleDriveConnection.connectedAt,
      connectedByName: users.name,
    })
    .from(googleDriveConnection)
    .leftJoin(users, eq(users.id, googleDriveConnection.connectedBy))
    .where(eq(googleDriveConnection.id, 1));
  return {
    serverConfigured: driveConfigured(),
    connected: Boolean(row),
    /** Ready = exports can be saved to Drive right now. */
    ready: Boolean(row && row.folderId && !row.lastError && driveConfigured()),
    ...(row ?? {}),
  };
}
export type DriveStatus = Awaited<ReturnType<typeof getDriveStatus>>;

/** After "Allow": swap the one-time code for tokens and remember the account. */
export async function completeConnect(code: string, origin: string, user: CurrentUser) {
  const { clientId, clientSecret } = credentials();
  const res = await fetch(URLS.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri(origin), grant_type: "authorization_code" }),
  });
  const tok = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error?: string; error_description?: string };
  if (!res.ok || !tok.access_token) throw new AppError(`Google sign-in failed: ${tok.error_description ?? tok.error ?? res.status}`);
  if (!tok.refresh_token) throw new AppError("Google didn't return a long-term key. Remove the app's access in your Google account and connect again.");

  const info = await fetch(URLS.userinfo, { headers: { Authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json() as Promise<{ email?: string }>);
  const email = info.email ?? "unknown Google account";

  // Keep the folder when reconnecting the same account; clear it for another account.
  const [prev] = await db.select().from(googleDriveConnection).where(eq(googleDriveConnection.id, 1));
  const keepFolder = prev && prev.accountEmail === email;
  const values = {
    accountEmail: email,
    refreshTokenEnc: seal(tok.refresh_token),
    folderId: keepFolder ? prev.folderId : null,
    folderName: keepFolder ? prev.folderName : null,
    folderLink: keepFolder ? prev.folderLink : null,
    lastError: null,
    connectedBy: user.id,
    connectedAt: new Date(),
  };
  if (prev) await db.update(googleDriveConnection).set(values).where(eq(googleDriveConnection.id, 1));
  else await db.insert(googleDriveConnection).values({ id: 1, ...values });
  tokenCache = null;
  return email;
}

export async function disconnectDrive() {
  const [row] = await db.select().from(googleDriveConnection).where(eq(googleDriveConnection.id, 1));
  if (!row) return;
  const token = open(row.refreshTokenEnc);
  if (token) {
    // Tell Google to cancel the key too (ignore failures: we forget it either way).
    await fetch(URLS.revoke, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) }).catch(() => {});
  }
  await db.delete(googleDriveConnection).where(eq(googleDriveConnection.id, 1));
  tokenCache = null;
}

// ------------------------------------------------------------------ access token
let tokenCache: { token: string; expires: number } | null = null;

async function markBroken(message: string) {
  await db.update(googleDriveConnection).set({ lastError: message.slice(0, 255) }).where(eq(googleDriveConnection.id, 1));
}

/** A short-lived access token from the stored refresh token (cached ~55 min). */
async function accessToken() {
  if (tokenCache && tokenCache.expires > Date.now() + 60_000) return tokenCache.token;
  const { clientId, clientSecret } = credentials();
  const [row] = await db.select().from(googleDriveConnection).where(eq(googleDriveConnection.id, 1));
  if (!row) throw new AppError("Google Drive isn't connected. Ask the Director to connect it in Settings.");
  const refresh = open(row.refreshTokenEnc);
  if (!refresh) {
    await markBroken("The stored Google key can't be read (the server's SESSION_SECRET changed). Reconnect Google Drive.");
    throw new AppError("Google Drive needs to be reconnected in Settings.");
  }
  const res = await fetch(URLS.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refresh, grant_type: "refresh_token" }),
  });
  const tok = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !tok.access_token) {
    if (tok.error === "invalid_grant") {
      await markBroken("Google access was removed or expired. Reconnect Google Drive.");
      throw new AppError("Google Drive access was removed or expired. Ask the Director to reconnect it in Settings.");
    }
    throw new AppError(`Couldn't reach Google Drive (${tok.error ?? res.status}). Try again.`);
  }
  tokenCache = { token: tok.access_token, expires: Date.now() + (tok.expires_in ?? 3600) * 1000 };
  return tokenCache.token;
}

async function driveFetch(url: string, init: RequestInit = {}) {
  const token = await accessToken();
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
  return { res, body };
}

// ------------------------------------------------------------------ folder
/**
 * Accepts what people paste: a folder link
 * (https://drive.google.com/drive/folders/1AbC…?usp=sharing, …/u/0/folders/…, ?id=…)
 * or the bare folder ID.
 */
export function folderIdFromLink(input: string): string | null {
  const v = input.trim();
  const m = v.match(/\/folders\/([A-Za-z0-9_-]{10,})/) ?? v.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(v) ? v : null;
}

/** Checks the folder exists, is a folder and the connected account may add files; then saves it. */
export async function setDriveFolder(link: string) {
  const folderId = folderIdFromLink(link);
  if (!folderId) throw new ValidationError({ folderLink: ["Paste the link of a Google Drive folder (it contains /folders/…)."] });
  const { res, body } = await driveFetch(`${URLS.files}/${encodeURIComponent(folderId)}?fields=id,name,mimeType,trashed,capabilities(canAddChildren)&supportsAllDrives=true`);
  if (res.status === 404) throw new ValidationError({ folderLink: ["That folder wasn't found, or the connected Google account can't see it. Share it with that account or pick another folder."] });
  if (!res.ok) throw new AppError(`Google Drive said: ${body.error?.message ?? res.status}`);
  const f = body as { name?: string; mimeType?: string; trashed?: boolean; capabilities?: { canAddChildren?: boolean } };
  if (f.mimeType !== FOLDER_MIME) throw new ValidationError({ folderLink: ["That link is a file, not a folder."] });
  if (f.trashed) throw new ValidationError({ folderLink: ["That folder is in the Drive trash."] });
  if (f.capabilities?.canAddChildren === false) throw new ValidationError({ folderLink: ["The connected account can only view that folder. It needs edit access."] });

  await db
    .update(googleDriveConnection)
    .set({ folderId, folderName: f.name ?? "Folder", folderLink: link.trim().slice(0, 500), lastError: null })
    .where(eq(googleDriveConnection.id, 1));
  return { folderId, folderName: f.name ?? "Folder" };
}

/** Finds (or creates) a sub-folder by name, e.g. "2026-11". */
async function subFolder(parentId: string, name: string) {
  const q = `'${parentId}' in parents and name = '${name.replace(/'/g, "\\'")}' and mimeType = '${FOLDER_MIME}' and trashed = false`;
  const found = await driveFetch(`${URLS.files}?q=${encodeURIComponent(q)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  const files = (found.body.files as { id: string }[] | undefined) ?? [];
  if (found.res.ok && files[0]) return files[0].id;
  const made = await driveFetch(`${URLS.files}?supportsAllDrives=true&fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  if (!made.res.ok) throw new AppError(`Couldn't create the "${name}" folder in Drive: ${made.body.error?.message ?? made.res.status}`);
  return made.body.id as string;
}

/**
 * Uploads a file into <chosen folder>/<YYYY-MM>/ and returns its Drive id + link.
 * Multipart upload (metadata + file in one request); fine for report-sized files.
 */
export async function uploadToDrive(file: { name: string; mimeType: string; data: Buffer; month: string }) {
  const [row] = await db.select().from(googleDriveConnection).where(eq(googleDriveConnection.id, 1));
  if (!row) throw new AppError("Google Drive isn't connected. Ask the Director to connect it in Settings.");
  if (!row.folderId) throw new AppError("No Google Drive folder is set. Ask the Director to paste the folder link in Settings.");

  const parent = await subFolder(row.folderId, file.month);
  const boundary = `cb-${Date.now().toString(36)}`;
  const meta = JSON.stringify({ name: file.name, parents: [parent] });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${file.mimeType}\r\n\r\n`),
    file.data,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const { res, body: out } = await driveFetch(`${URLS.upload}?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (res.status === 404) {
    await markBroken("The Drive folder was deleted or access to it was removed. Paste a folder link again.");
    throw new AppError("The Google Drive folder can't be found any more. Ask the Director to set the folder again in Settings.");
  }
  if (!res.ok) throw new AppError(`Upload to Google Drive failed: ${out.error?.message ?? res.status}`);
  return { id: out.id as string, link: (out.webViewLink as string | undefined) ?? `https://drive.google.com/file/d/${out.id}/view` };
}

/** What the Excel pop-up needs to know for this user. */
export async function driveInfoFor(user: { role: CurrentUser["role"] }) {
  const s = await getDriveStatus();
  return { ready: s.ready, connected: s.connected, folderName: s.folderName ?? null, canSave: hasPermission(user, "saveReportsToDrive") };
}
