import "server-only";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { invoiceLinks } from "@/db/schema";
import { money, niceDate, nicePeriod, niceTime } from "@/components/ui";
import type { CurrentUser } from "@/lib/dal";
import { ConflictError } from "@/lib/errors";
import { hospitalPlace, waDigits, whatsappNumberOf } from "@/lib/lk-rules";
import { hashToken, isTokenShaped, LINK_DAYS, linkState, newToken, publicBaseUrl, summarizeLinks, type LinkState } from "@/lib/share-link";
import { getInvoice, loadInvoice, type InvoiceDetails } from "./service";

/** Secret 7-day links to an invoice, sent to the customer on WhatsApp (see src/lib/share-link.ts). */
export { LINK_DAYS, publicBaseUrl };

async function createLink(invoiceId: number, user: CurrentUser, base: string) {
  const { token, tokenHash, expiresAt } = newToken();
  await db.insert(invoiceLinks).values({ invoiceId, tokenHash, expiresAt, createdBy: user.id });
  return { url: `${base}/i/${token}`, expiresAt };
}

/** Looks up a link from the secret in the URL. */
export async function findLink(token: string): Promise<{ state: LinkState; link?: typeof invoiceLinks.$inferSelect }> {
  if (!isTokenShaped(token)) return { state: "missing" };
  const [link] = await db.select().from(invoiceLinks).where(eq(invoiceLinks.tokenHash, hashToken(token)));
  return { state: linkState(link), link };
}

/** The invoice behind a working link (null if the link doesn't work). */
export async function invoiceForToken(token: string, opts: { countView?: boolean } = {}) {
  const r = await findLink(token);
  if (r.state !== "ok" || !r.link) return { state: r.state, invoice: null, expiresAt: r.link?.expiresAt ?? null };
  const invoice = await loadInvoice(r.link.invoiceId);
  if (!invoice) return { state: "missing" as const, invoice: null, expiresAt: null };
  if (opts.countView) {
    await db
      .update(invoiceLinks)
      .set({ views: sql`${invoiceLinks.views} + 1`, lastViewedAt: new Date() })
      .where(eq(invoiceLinks.id, r.link.id));
  }
  return { state: "ok" as const, invoice, expiresAt: r.link.expiresAt };
}

/** For the invoice page: how many links work now, how often they were opened. */
export async function linkSummary(invoiceId: number) {
  return summarizeLinks(await db.select().from(invoiceLinks).where(eq(invoiceLinks.invoiceId, invoiceId)).orderBy(desc(invoiceLinks.id)));
}

/** "Disable links": every link of this invoice stops working now. */
export async function disableInvoiceLinks(invoiceId: number, user: CurrentUser) {
  await getInvoice(invoiceId, user); // branch check
  await db
    .update(invoiceLinks)
    .set({ disabledAt: new Date() })
    .where(and(eq(invoiceLinks.invoiceId, invoiceId), isNull(invoiceLinks.disabledAt), gt(invoiceLinks.expiresAt, new Date())));
  return linkSummary(invoiceId);
}

/** The WhatsApp message: every detail of the invoice, then the link (when the app has a public address). */
export function invoiceMessage(inv: InvoiceDetails, link: { url: string } | null) {
  const where = inv.locationType === "hospital" ? hospitalPlace(inv.hospitalName, inv.wardNo, inv.bedNo) : inv.serviceAddress;
  const lines = [
    `Dear ${inv.customerName},`,
    "",
    `Thank you for choosing ${inv.company.name || "our services"}.`,
    "",
    `🧾 Invoice: ${inv.invoiceNo}`,
    inv.days > 1
      ? `📅 Service: ${nicePeriod(inv.serviceDate, inv.days)} (${inv.days} days), from ${niceTime(inv.startTime)}`
      : `📅 Service date: ${niceDate(inv.serviceDate)}, ${niceTime(inv.startTime)}`,
    `👤 Patient: ${inv.patientName}`,
    `📦 Package: ${inv.packageName || `${inv.durationHours}-hour care session`}`,
    where ? `📍 ${where}` : null,
    inv.days > 1 ? `💰 Amount: ${money(inv.rate)} × ${inv.days} days = ${money(inv.amount)}` : `💰 Amount: ${money(inv.amount)}`,
  ];
  if (link) lines.push("", `View / download your invoice (link valid for ${LINK_DAYS} days):`, link.url);
  lines.push("", "Thank you.");
  return lines.filter((l) => l !== null).join("\n");
}

/**
 * "Send on WhatsApp": makes a new 7-day link and the message, and the wa.me
 * address that opens WhatsApp with the customer's number and the message filled in.
 */
export async function prepareWhatsappInvoice(invoiceId: number, user: CurrentUser) {
  const inv = await getInvoice(invoiceId, user);
  if (inv.status !== "printed") throw new ConflictError(`Mark ${inv.invoiceNo} as printed first, then send it on WhatsApp.`);
  const number = whatsappNumberOf({ phone: inv.customerPhone, altPhone: inv.customerAltPhone, phoneWhatsapp: inv.phoneWhatsapp, altPhoneWhatsapp: inv.altPhoneWhatsapp, whatsappPhone: inv.whatsappPhone });
  if (!number) throw new ConflictError("This customer has no WhatsApp number. Add one in the customer's profile.");

  const base = await publicBaseUrl();
  const link = base ? await createLink(invoiceId, user, base) : null;
  const message = invoiceMessage(inv, link);
  return {
    number,
    message,
    waUrl: `https://wa.me/${waDigits(number)}?text=${encodeURIComponent(message)}`,
    link: link ? { url: link.url, expiresAt: link.expiresAt.toISOString() } : null,
    summary: await linkSummary(invoiceId),
  };
}
