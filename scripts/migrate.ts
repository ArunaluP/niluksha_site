/**
 * Brings an existing database up to the latest schema.
 *
 *   npm run db:migrate            -> shows which migrations are applied / missing
 *   npm run db:migrate -- --apply -> runs the missing ones, in order
 *
 * There is no migrations table: each migration is detected by what it adds
 * (a column, table or index), so it also works on databases that were
 * updated by hand with SOURCE. Take a backup before --apply.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import mysql from "mysql2/promise";

type Conn = mysql.Connection;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✘ DATABASE_URL is not set. Add it to .env.local");
  process.exit(1);
}
const apply = process.argv.includes("--apply");

async function hasColumn(c: Conn, table: string, column: string) {
  const [r] = await c.query("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?", [table, column]);
  return (r as unknown[]).length > 0;
}
async function hasTable(c: Conn, table: string) {
  const [r] = await c.query("SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", [table]);
  return (r as unknown[]).length > 0;
}
async function hasSetting(c: Conn, key: string) {
  const [r] = await c.query("SELECT 1 FROM settings WHERE setting_key = ?", [key]);
  return (r as unknown[]).length > 0;
}
async function hasIndex(c: Conn, table: string, index: string) {
  const [r] = await c.query("SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?", [table, index]);
  return (r as unknown[]).length > 0;
}

/** In order. `done` = the change this migration makes is already in the database. */
const MIGRATIONS: { file: string; what: string; done: (c: Conn) => Promise<boolean> }[] = [
  { file: "002_split_names.sql", what: "first / middle / last name", done: (c) => hasColumn(c, "customers", "first_name") },
  { file: "003_customer_dob.sql", what: "customer date of birth", done: (c) => hasColumn(c, "customers", "dob") },
  { file: "004_relationship_other.sql", what: "patient 'other' relationship", done: (c) => hasColumn(c, "patients", "relationship_other") },
  { file: "005_email.sql", what: "customer / employee email", done: (c) => hasColumn(c, "customers", "email") },
  { file: "006_ward_bed.sql", what: "hospital ward no + bed no", done: (c) => hasColumn(c, "bookings", "ward_no") },
  { file: "007_packages.sql", what: "care packages", done: (c) => hasTable(c, "packages") },
  { file: "008_report_index.sql", what: "reports index", done: (c) => hasIndex(c, "booking_status_logs", "idx_logs_created") },
  { file: "009_log_employee.sql", what: "employee on assignment logs", done: (c) => hasColumn(c, "booking_status_logs", "employee_id") },
  { file: "010_drive_exports.sql", what: "Google Drive export + export log", done: (c) => hasTable(c, "export_logs") },
  { file: "011_times_utc.sql", what: "all times stored in UTC", done: (c) => hasSetting(c, "db_time_zone") },
  { file: "012_whatsapp.sql", what: "customer WhatsApp number + invoice links", done: (c) => hasTable(c, "invoice_links") },
  { file: "013_booking_days.sql", what: "bookings for several days", done: (c) => hasColumn(c, "bookings", "days") },
  { file: "014_employee_registration.sql", what: "employee registration form + photo", done: (c) => hasTable(c, "employee_photos") },
  { file: "015_booking_links.sql", what: "booking confirmation on WhatsApp", done: (c) => hasTable(c, "booking_links") },
];

/** The files say `USE care_booking;` — drop it so the script works on the database in DATABASE_URL. */
const sqlOf = (file: string) =>
  readFileSync(join(process.cwd(), "database", "migrations", file), "utf8")
    .replace(/^\s*USE\s+[`\w]+\s*;\s*$/gim, "")
    .trim();

async function main() {
  const c = await mysql.createConnection({ uri: url, multipleStatements: true, timezone: "Z" });
  await c.query("SET time_zone = '+00:00'");
  const [[{ db }]] = (await c.query("SELECT DATABASE() AS db")) as unknown as [[{ db: string }]];
  if (!(await hasTable(c, "bookings"))) {
    console.error(`✘ Database "${db}" has no bookings table. For a new install run database/care_booking_schema.sql instead.`);
    process.exit(1);
  }
  console.log(`Database "${db}"\n`);

  const missing: typeof MIGRATIONS = [];
  for (const m of MIGRATIONS) {
    const done = await m.done(c);
    console.log(`  ${done ? "✔ applied" : "• missing"}  ${m.file.padEnd(28)} ${m.what}`);
    if (!done) missing.push(m);
  }

  if (!missing.length) {
    console.log("\n✔ Database is up to date.");
    return c.end();
  }
  if (!apply) {
    console.log(`\n${missing.length} migration(s) to run. Back up first, then:  npm run db:migrate -- --apply`);
    return c.end();
  }

  console.log("");
  for (const m of missing) {
    process.stdout.write(`  → ${m.file} ... `);
    try {
      await c.query(sqlOf(m.file));
      if (!(await m.done(c))) throw new Error("ran, but the change is not visible");
      console.log("done");
    } catch (e) {
      console.log("FAILED");
      console.error(`\n✘ ${m.file}: ${(e as Error).message}\nStopped here; later migrations were not run. Restore the backup if needed.`);
      await c.end();
      process.exit(1);
    }
  }
  console.log("\n✔ Database is up to date. Run  npm run db:check  to compare it with the code.");
  await c.end();
}

main().catch((e) => {
  console.error("✘", e.message);
  process.exit(1);
});
