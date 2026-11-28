import "server-only";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { money, niceDate, nicePeriod, niceTime } from "@/components/ui";
import { toIsoDate } from "@/lib/dates";
import { ACCENT, drawLogo, FAINT, H, INK, M, makePdfTools, MUTED, W } from "../invoices/pdf";
import { placeOf, STATUS_TITLE, statusLine, type BookingConfirmation } from "./confirmation";

/**
 * The booking confirmation as an A4 PDF, laid out like the printed page
 * (src/app/(app)/bookings/[ref]/print/page.tsx). Used by the WhatsApp link and the PDF button.
 */
export async function bookingPdf(b: BookingConfirmation): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Booking ${b.bookingNo}`);
  doc.setAuthor(b.company.name || "Care Services");
  doc.setCreator("Care Booking");
  const page = doc.addPage([W, H]);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { text, line, wrap } = makePdfTools(page, reg);

  // ---------------- header
  let y = H - M;
  drawLogo(page, M, y - 32);
  text(b.company.name || "Care Services", M + 44, y - 13, { font: bold, size: 14, color: INK });
  let cy = y - 28;
  if (b.company.address) {
    for (const l of wrap(b.company.address, 230, reg, 9.5)) {
      text(l, M + 44, cy, { size: 9.5, color: MUTED });
      cy -= 13;
    }
  }
  if (b.company.phone) text(`Tel: ${b.company.phone}`, M + 44, cy, { size: 9.5, color: MUTED });

  text("B O O K I N G", W - M, y - 14, { size: 18, color: INK, align: "right" });
  text("CONFIRMATION", W - M, y - 28, { size: 8.5, color: MUTED, align: "right" });
  text(b.bookingNo, W - M, y - 44, { font: bold, size: 11, color: INK, align: "right" });
  text(`Booked: ${niceDate(toIsoDate(b.bookedOn))}`, W - M, y - 57, { size: 9.5, color: MUTED, align: "right" });

  y -= 84;
  line(y);

  // ---------------- status
  y -= 22;
  text("STATUS", M, y, { font: bold, size: 8, color: FAINT });
  text(STATUS_TITLE[b.status] ?? b.status, M + 52, y, { font: bold, size: 10, color: ACCENT });
  y -= 14;
  text(statusLine(b), M, y, { size: 9.5, color: MUTED });

  // ---------------- customer | booking
  y -= 30;
  const col2 = M + (W - 2 * M) / 2 + 12;
  text("CUSTOMER", M, y, { font: bold, size: 8, color: FAINT });
  text("BOOKING", col2, y, { font: bold, size: 8, color: FAINT });
  let ly = y - 16;
  text(b.customerName, M, ly, { font: bold, size: 10.5, color: INK });
  ly -= 14;
  text(b.customerNo, M, ly, { size: 9.5, color: MUTED });
  if (b.customerAddress) {
    for (const l of wrap(b.customerAddress, 220, reg, 9.5)) {
      ly -= 13;
      text(l, M, ly, { size: 9.5 });
    }
  }
  ly -= 13;
  text([b.customerPhone, b.customerAltPhone].filter(Boolean).join(" / "), M, ly, { size: 9.5 });

  let ry = y - 16;
  const kv = (k: string, v: string) => {
    text(k, col2, ry, { size: 9.5, color: MUTED });
    text(v, col2 + reg.widthOfTextAtSize(k, 9.5) + 4, ry, { size: 9.5 });
    ry -= 14;
  };
  kv("Patient:", b.patientName);
  if (b.employeeName && b.status !== "pending" && b.status !== "confirmed") kv("Caregiver:", b.employeeName);
  if (b.branchName) kv("Branch:", b.branchName);

  // ---------------- service table
  y = Math.min(ly, ry) - 26;
  line(y + 14);
  const cDays = W - M - 170;
  const cRate = W - M - 90;
  text("SERVICE", M, y, { font: bold, size: 8, color: MUTED });
  text("DAYS", cDays, y, { font: bold, size: 8, color: MUTED, align: "right" });
  text("RATE", cRate, y, { font: bold, size: 8, color: MUTED, align: "right" });
  text("ESTIMATE", W - M, y, { font: bold, size: 8, color: MUTED, align: "right" });
  line(y - 8);

  y -= 26;
  const where = placeOf(b, ", ") ?? "";
  const title = `${b.packageName ? `${b.packageName} · ` : ""}${b.durationHours}-hour care session`;
  const detail = `${nicePeriod(b.serviceDate, b.days)} from ${niceTime(b.startTime)}${b.days > 1 ? " each day" : ""} · ${b.locationType === "hospital" ? "Hospital" : "Home"}: ${where}`;
  text(title, M, y, { font: bold, size: 10, color: INK });
  text(String(b.days), cDays, y, { size: 10, align: "right" });
  text(money(b.rate), cRate, y, { size: 10, align: "right" });
  text(money(b.estimate), W - M, y, { font: bold, size: 10, color: INK, align: "right" });
  let dy = y - 14;
  for (const l of wrap(detail, cDays - M - 40, reg, 9)) {
    text(l, M, dy, { size: 9, color: MUTED });
    dy -= 12;
  }
  y = dy - 10;
  line(y);

  // ---------------- estimate
  y -= 26;
  const tx = W - M - 210;
  text("Estimated amount", tx, y, { font: bold, size: 12, color: INK });
  text(money(b.estimate), W - M, y, { font: bold, size: 12, color: INK, align: "right" });
  y -= 16;
  text("The final amount is shown on your invoice after the service.", W - M, y, { size: 8.5, color: MUTED, align: "right" });

  // ---------------- notes
  if (b.notes) {
    y -= 34;
    text("NOTES", M, y, { font: bold, size: 8, color: FAINT });
    for (const l of wrap(b.notes, W - 2 * M, reg, 9.5)) {
      y -= 14;
      text(l, M, y, { size: 9.5 });
    }
  }

  // ---------------- footer
  y -= 60;
  line(y);
  text(`Thank you for choosing ${b.company.name || "our services"}.`, M, y - 22, { size: 8.5, color: MUTED });
  if (b.company.phone) text(`To change or cancel this booking, please call ${b.company.phone}.`, M, y - 35, { size: 8.5, color: MUTED });

  return doc.save();
}
