import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { money, niceDate, nicePeriod, niceTime } from "@/components/ui";
import { hospitalPlace } from "@/lib/lk-rules";
import type { InvoiceDetails } from "./service";

/**
 * The invoice as an A4 PDF, laid out like the printed invoice page
 * (src/app/(app)/invoices/[id]/page.tsx). Used by the WhatsApp link and the PDF button.
 */

export const W = 595.28; // A4 in points
export const H = 841.89;
export const M = 48; // page margin

export const INK = rgb(0.06, 0.09, 0.16); // slate-900
export const TEXT = rgb(0.2, 0.25, 0.33); // slate-700
export const MUTED = rgb(0.39, 0.45, 0.55); // slate-500
export const FAINT = rgb(0.58, 0.64, 0.72); // slate-400
export const LINE = rgb(0.89, 0.91, 0.94); // slate-200
export const ACCENT = rgb(0.4, 0.345, 0.96); // #6658f5

export async function invoicePdf(inv: InvoiceDetails): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Invoice ${inv.invoiceNo}`);
  doc.setAuthor(inv.company.name || "Care Services");
  doc.setCreator("Care Booking");
  const page = doc.addPage([W, H]);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const { text, line, wrap } = makePdfTools(page, reg);

  // ---------------- header: logo + company | INVOICE + number
  let y = H - M;
  drawLogo(page, M, y - 32);
  text(inv.company.name || "Care Services", M + 44, y - 13, { font: bold, size: 14, color: INK });
  let cy = y - 28;
  if (inv.company.address) {
    for (const l of wrap(inv.company.address, 250, reg, 9.5)) {
      text(l, M + 44, cy, { size: 9.5, color: MUTED });
      cy -= 13;
    }
  }
  if (inv.company.phone) text(`Tel: ${inv.company.phone}`, M + 44, cy, { size: 9.5, color: MUTED });

  text("I N V O I C E", W - M, y - 18, { size: 22, color: INK, align: "right" });
  text(inv.invoiceNo, W - M, y - 38, { font: bold, size: 11, color: INK, align: "right" });
  text(`Date: ${niceDate(inv.invoiceDate)}`, W - M, y - 52, { size: 9.5, color: MUTED, align: "right" });

  y -= 84;
  line(y);

  // ---------------- bill to | service
  y -= 26;
  const col2 = M + (W - 2 * M) / 2 + 12;
  text("BILL TO", M, y, { font: bold, size: 8, color: FAINT });
  text("SERVICE", col2, y, { font: bold, size: 8, color: FAINT });
  let ly = y - 16;
  text(inv.customerName, M, ly, { font: bold, size: 10.5, color: INK });
  ly -= 14;
  text(inv.customerNo, M, ly, { size: 9.5, color: MUTED });
  if (inv.customerAddress) {
    for (const l of wrap(inv.customerAddress, 220, reg, 9.5)) {
      ly -= 13;
      text(l, M, ly, { size: 9.5 });
    }
  }
  ly -= 13;
  text(inv.customerPhone, M, ly, { size: 9.5 });

  let ry = y - 16;
  const kv = (k: string, v: string) => {
    text(k, col2, ry, { size: 9.5, color: MUTED });
    text(v, col2 + reg.widthOfTextAtSize(k, 9.5) + 4, ry, { size: 9.5, color: TEXT });
    ry -= 14;
  };
  kv("Booking:", inv.bookingNo);
  kv("Patient:", inv.patientName);
  kv("Caregiver:", `${inv.employeeName ?? "-"}${inv.employeeNo ? ` (${inv.employeeNo})` : ""}`);
  kv("Branch:", inv.branchName);

  // ---------------- line table
  y = Math.min(ly, ry) - 26;
  line(y + 14);
  const cQty = W - M - 170;
  const cRate = W - M - 90;
  text("DESCRIPTION", M, y, { font: bold, size: 8, color: MUTED });
  text("QTY", cQty, y, { font: bold, size: 8, color: MUTED, align: "right" });
  text("RATE", cRate, y, { font: bold, size: 8, color: MUTED, align: "right" });
  text("AMOUNT", W - M, y, { font: bold, size: 8, color: MUTED, align: "right" });
  line(y - 8);

  y -= 26;
  const where = inv.locationType === "hospital" ? hospitalPlace(inv.hospitalName, inv.wardNo, inv.bedNo, ", ") : inv.serviceAddress ?? "";
  const title = `${inv.packageName ? `${inv.packageName} · ` : ""}${inv.durationHours}-hour care session${inv.days > 1 ? ` × ${inv.days} days` : ""}`;
  const detail = `${nicePeriod(inv.serviceDate, inv.days)} from ${niceTime(inv.startTime)}${inv.days > 1 ? " each day" : ""} · ${inv.locationType === "hospital" ? "Hospital" : "Home"}: ${where}`;
  text(title, M, y, { font: bold, size: 10, color: INK });
  text(inv.days > 1 ? `${Number(inv.qty)} days` : String(Number(inv.qty)), cQty, y, { size: 10, align: "right" });
  text(money(inv.rate), cRate, y, { size: 10, align: "right" });
  text(money(inv.amount), W - M, y, { font: bold, size: 10, color: INK, align: "right" });
  let dy = y - 14;
  for (const l of wrap(detail, cQty - M - 60, reg, 9)) {
    text(l, M, dy, { size: 9, color: MUTED });
    dy -= 12;
  }
  y = dy - 10;
  line(y);

  // ---------------- totals
  y -= 24;
  const tx = W - M - 190;
  text("Subtotal", tx, y, { size: 10, color: MUTED });
  text(money(inv.amount), W - M, y, { size: 10, color: MUTED, align: "right" });
  y -= 12;
  line(y, tx);
  y -= 18;
  text("Total", tx, y, { font: bold, size: 12, color: INK });
  text(money(inv.amount), W - M, y, { font: bold, size: 12, color: INK, align: "right" });

  // ---------------- footer
  y -= 90;
  line(y);
  text(`Thank you for choosing ${inv.company.name || "our services"}.`, M, y - 22, { size: 8.5, color: MUTED });
  line(y - 18, W - M - 140, W - M, rgb(0.8, 0.83, 0.87));
  text("Authorised signature", W - M - 70 + reg.widthOfTextAtSize("Authorised signature", 8.5) / 2, y - 32, { size: 8.5, color: MUTED, align: "right" });

  return doc.save();
}

/** Rounded accent square with a white cross (the app's care mark). */
export function drawLogo(page: PDFPage, x: number, y: number) {
  const s = 32;
  const r = 8;
  const path = `M ${r} 0 H ${s - r} Q ${s} 0 ${s} ${r} V ${s - r} Q ${s} ${s} ${s - r} ${s} H ${r} Q 0 ${s} 0 ${s - r} V ${r} Q 0 0 ${r} 0 Z`;
  page.drawSvgPath(path, { x, y: y + s, color: ACCENT });
  const c = s / 2;
  page.drawRectangle({ x: x + c - 2.2, y: y + 8, width: 4.4, height: 16, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: x + 8, y: y + c - 2.2, width: 16, height: 4.4, color: rgb(1, 1, 1) });
}

type Color = ReturnType<typeof rgb>;

/** Drawing helpers shared by the invoice and booking-confirmation PDFs. */
export function makePdfTools(page: PDFPage, reg: PDFFont) {
  /** Text the standard PDF font can't draw (e.g. Sinhala) becomes "?" instead of failing. */
  const safe = (font: PDFFont, t: string) =>
    [...t]
      .map((ch) => {
        try {
          font.encodeText(ch);
          return ch;
        } catch {
          return "?";
        }
      })
      .join("");

  const text = (t: string, x: number, y: number, o: { font?: PDFFont; size?: number; color?: Color; align?: "left" | "right" } = {}) => {
    const font = o.font ?? reg;
    const size = o.size ?? 10;
    const s = safe(font, t);
    const dx = o.align === "right" ? font.widthOfTextAtSize(s, size) : 0;
    page.drawText(s, { x: x - dx, y, size, font, color: o.color ?? TEXT });
  };
  const line = (y: number, x1 = M, x2 = W - M, color = LINE) => page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.8, color });

  /** Splits text into lines that fit `width`. */
  const wrap = (t: string, width: number, font: PDFFont, size: number) => {
    const out: string[] = [];
    let cur = "";
    for (const word of safe(font, t).split(/\s+/)) {
      const next = cur ? `${cur} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && cur) {
        out.push(cur);
        cur = word;
      } else cur = next;
    }
    if (cur) out.push(cur);
    return out;
  };
  return { safe, text, line, wrap };
}
