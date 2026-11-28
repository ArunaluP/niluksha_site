/**
 * Clears the database for going live: removes all test data and keeps only
 *   - ONE Director login (password unchanged)
 *   - the DEFAULT package
 *   - the company settings (name, address, phone, public web address, prefixes)
 * Numbering starts again (BK-…-00001, INV-…-00001, CUS-00001, …).
 *
 *   npm run db:reset                                -> asks which Director to keep
 *   npm run db:reset -- --keep director@company.lk  -> keeps this Director
 *
 * Safety:
 *   1. A full backup is written to backups/ first (restore: see the end of this file's output).
 *   2. It shows what will be deleted and asks you to type RESET.
 *   3. It only runs on a database called "care_booking" (add --any-db for another name).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✘ DATABASE_URL is not set. Add it to .env.local");
  process.exit(1);
}
const args = process.argv.slice(2);
const keepArg = args.includes("--keep") ? args[args.indexOf("--keep") + 1] : undefined;
const anyDb = args.includes("--any-db");

/** Emptied completely (children before parents). */
const CLEAR = [
  "invoice_links",
  "booking_links",
  "export_logs",
  "google_drive_connection",
  "invoices",
  "booking_status_logs",
  "bookings",
  "patients",
  "customers",
  "employee_leaves",
  "employee_photos",
  "employees",
  "hospitals",
  "sequences",
] as const;

type Row = Record<string, unknown>;

async function main() {
  const c = await mysql.createConnection({ uri: url, timezone: "Z", dateStrings: true });
  await c.query("SET time_zone = '+00:00'");
  const rl = createInterface({ input: process.stdin, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (prompt: string) => {
    process.stdout.write(prompt);
    const r = await lines.next();
    return r.done ? "" : String(r.value);
  };
  const q = async <T = Row>(sql: string, params: unknown[] = []) => (await c.query(sql, params))[0] as T[];

  try {
    const [{ db }] = await q<{ db: string }>("SELECT DATABASE() AS db");
    if (db !== "care_booking" && !anyDb) {
      throw new Error(`This database is "${db}", not "care_booking". Add --any-db if you really mean it.`);
    }

    // ---------------------------------------------------------------- what to keep
    const admins = await q<{ id: number; name: string; email: string; is_active: number }>(
      "SELECT id, name, email, is_active FROM users WHERE role = 'admin' ORDER BY is_active DESC, id",
    );
    if (!admins.length) throw new Error("There is no Director (admin) login. Create one first: npm run user:create");
    let keep = admins[0];
    if (keepArg) {
      const found = admins.find((a) => a.email.toLowerCase() === keepArg.toLowerCase());
      if (!found) throw new Error(`No Director with email ${keepArg}. Directors: ${admins.map((a) => a.email).join(", ")}`);
      keep = found;
    } else if (admins.length > 1) {
      console.log("\nWhich Director login should stay?");
      admins.forEach((a, i) => console.log(`  ${i + 1}. ${a.name} <${a.email}>${a.is_active ? "" : " (inactive)"}`));
      const n = Number(await ask(`Number (1-${admins.length}): `));
      if (!Number.isInteger(n) || n < 1 || n > admins.length) throw new Error("Cancelled: no Director chosen.");
      keep = admins[n - 1];
    }

    const pkgs = await q<{ id: number; name: string; is_default: number }>("SELECT id, name, is_default FROM packages ORDER BY is_default DESC, is_active DESC, id");
    if (!pkgs.length) throw new Error("There are no packages. Add the default package first (Settings → Packages).");
    const keepPkg = pkgs[0];

    // ---------------------------------------------------------------- show the plan
    const count = async (t: string, where = "") => Number((await q<{ n: number }>(`SELECT COUNT(*) AS n FROM \`${t}\` ${where}`))[0].n);
    const plan: [string, number][] = [
      ["bookings", await count("bookings")],
      ["invoices", await count("invoices")],
      ["customers", await count("customers")],
      ["patients", await count("patients")],
      ["employees", await count("employees")],
      ["leave records", await count("employee_leaves")],
      ["hospitals", await count("hospitals")],
      ["branches", await count("branches")],
      ["other packages", await count("packages", `WHERE id <> ${keepPkg.id}`)],
      ["other logins", await count("users", `WHERE id <> ${keep.id}`)],
      ["Excel export log", await count("export_logs")],
      ["WhatsApp invoice links", await count("invoice_links")],
      ["WhatsApp booking links", await count("booking_links")],
      ["Google Drive connection", await count("google_drive_connection")],
    ];
    console.log(`\nDatabase: ${db}\n\nWILL BE DELETED:`);
    for (const [what, n] of plan) console.log(`  ${String(n).padStart(6)}  ${what}`);
    console.log(`\nWILL STAY:\n  Login:    ${keep.name} <${keep.email}> (password unchanged)\n  Package:  ${keepPkg.name}${keepPkg.is_default ? "" : " (will become the default)"}\n  Settings: company name, address, phone, public web address, prefixes`);
    console.log("  Numbering starts again: BK-…-00001, INV-…-00001, CUS-00001, EMP-0001 …\n");

    const answer = await ask('A backup is made first. Type RESET to delete, anything else to cancel: ');
    if (answer.trim() !== "RESET") {
      console.log("Cancelled. Nothing was changed.");
      return;
    }

    // ---------------------------------------------------------------- 1. backup
    const file = await backup(c, db);
    console.log(`✔ Backup written: ${file}`);

    // ---------------------------------------------------------------- 2. delete
    await c.beginTransaction();
    try {
      for (const t of CLEAR) await c.query(`DELETE FROM \`${t}\``);
      await c.query("DELETE FROM packages WHERE id <> ?", [keepPkg.id]);
      await c.query("UPDATE packages SET is_default = 1, is_active = 1 WHERE id = ?", [keepPkg.id]);
      await c.query("UPDATE settings SET updated_by = NULL");
      await c.query("UPDATE branches SET manager_user_id = NULL");
      await c.query("UPDATE users SET branch_id = NULL, is_active = 1 WHERE id = ?", [keep.id]);
      await c.query("DELETE FROM users WHERE id <> ?", [keep.id]);
      await c.query("DELETE FROM branches");
      await c.commit();
    } catch (e) {
      await c.rollback();
      throw e;
    }

    // ---------------------------------------------------------------- 3. ids start again
    for (const t of [...CLEAR.filter((t) => t !== "sequences"), "branches"]) await c.query(`ALTER TABLE \`${t}\` AUTO_INCREMENT = 1`);

    console.log("✔ Database cleared.");
    console.log(`\nLog in with ${keep.email}. Next: add branches, hospitals, employees and logins in the app.`);
    console.log(`To undo: mysql -u root -p ${db} < "${file}"`);
  } finally {
    rl.close();
    await c.end();
  }
}

/** Every row of every table as INSERT statements (restorable with the mysql client or SOURCE). */
async function backup(c: mysql.Connection, db: string) {
  const [tables] = (await c.query("SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME")) as unknown as [{ t: string }[]];
  const out: string[] = [
    `-- Backup of ${db}, ${new Date().toISOString()} (times are UTC)`,
    `-- Restore: mysql -u root -p ${db} < this-file.sql`,
    `USE \`${db}\`;`,
    "SET FOREIGN_KEY_CHECKS = 0;",
    "SET time_zone = '+00:00';",
    "",
  ];
  for (const { t } of tables) {
    const [cols] = (await c.query(
      "SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND EXTRA NOT IN ('VIRTUAL GENERATED', 'STORED GENERATED') ORDER BY ORDINAL_POSITION",
      [t],
    )) as unknown as [{ name: string }[]];
    const names = cols.map((x) => x.name);
    const [rows] = (await c.query(`SELECT ${names.map((n) => `\`${n}\``).join(", ")} FROM \`${t}\``)) as unknown as [Row[]];
    out.push(`DELETE FROM \`${t}\`;`);
    for (const r of rows) out.push(`INSERT INTO \`${t}\` (${names.map((n) => `\`${n}\``).join(", ")}) VALUES (${names.map((n) => c.escape(r[n])).join(", ")});`);
    out.push("");
  }
  out.push("SET FOREIGN_KEY_CHECKS = 1;", "");
  const dir = join(process.cwd(), "backups");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const file = join(dir, `${db}-before-reset-${stamp}.sql`);
  writeFileSync(file, out.join("\n"), "utf8");
  return file;
}

main().catch((e) => {
  console.error(`✘ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
