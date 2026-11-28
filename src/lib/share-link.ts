import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getSettings } from "./settings";

/**
 * Secret links sent to customers on WhatsApp (invoices, booking confirmations).
 *  - the link holds a 256-bit random secret; only its SHA-256 is stored, so
 *    the database alone can't be used to open anything
 *  - each link shows one record only and stops working after LINK_DAYS days
 *    or when staff press "Disable links"
 */
export const LINK_DAYS = 7;
const TOKEN = /^[A-Za-z0-9_-]{43}$/; // 32 bytes in base64url

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const isTokenShaped = (token: string) => TOKEN.test(token);

/** A new secret + its hash + when it expires. */
export function newToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + LINK_DAYS * 24 * 60 * 60 * 1000) };
}

/** Settings → "Public web address", e.g. https://care.example.lk (no trailing slash), or null. */
export async function publicBaseUrl(): Promise<string | null> {
  const v = (await getSettings()).public_base_url?.trim();
  return v ? v.replace(/\/+$/, "") : null;
}

export type LinkState = "ok" | "expired" | "disabled" | "missing";

type LinkRow = { views: number; lastViewedAt: Date | null; disabledAt: Date | null; expiresAt: Date };

/** State of one stored link. */
export function linkState(link: LinkRow | undefined): LinkState {
  if (!link) return "missing";
  if (link.disabledAt) return "disabled";
  if (link.expiresAt.getTime() <= Date.now()) return "expired";
  return "ok";
}

/** How many links work now, how often they were opened (newest link first in `rows`). */
export function summarizeLinks(rows: LinkRow[]) {
  const now = Date.now();
  const active = rows.filter((l) => !l.disabledAt && l.expiresAt.getTime() > now);
  const lastViewed = rows.map((l) => l.lastViewedAt).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  return {
    sent: rows.length,
    active: active.length,
    activeUntil: active[0]?.expiresAt ?? null,
    views: rows.reduce((n, l) => n + l.views, 0),
    lastViewed,
  };
}

/** Link previews (WhatsApp makes one when the message is sent) don't count as the customer opening it. */
export const PREVIEW_BOT = /whatsapp|facebookexternalhit|facebot|bot|crawler|spider|preview/i;
