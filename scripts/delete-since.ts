/**
 * Deletes everything that was ADDED after a given time (Sri Lanka time), and
 * undoes booking steps (confirm / assign / deliver / print) done after it.
 * Use it to remove test or demo data entered after a certain moment.
 *
 *   npm run db:delete-since -- "2026-11-25 19:00"
 *
 * Safety:
 *   1. It first shows exactly what will be deleted or undone, with times.
 *   2. You must type DELETE to go ahead; anything else cancels.
 *   3. A full backup is written to backups/ before anything changes.
 *   4. Everything runs in one transaction: if anything fails, nothing changes.
 *
 * Not undone: plain edits made after that time to OLDER records (for example a
 * customer's phone number changed). Those are listed so you can fix them by hand.
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

type Row = Record<string, unknown>;
type Status =
  | "pending"
  | "confirmed"
  | "ignored"
  | "assigned"
  | "delivered"
  | "invoice_printed";

/** "2026-11-25 19:00" in Sri Lanka time (UTC+5:30) -> "2026-11-25 13:30:00" UTC. */
function sriLankaToUtc(input: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/.exec(input.trim());
  if (!m)
    throw new Error(
      `Give the time like this: "2026-11-25 19:00" (Sri Lanka time). You gave: "${input}"`,
    );
  const [, y, mo, d, h, mi] = m.map(Number);
  const utc = new Date(Date.UTC(y, mo - 1, d, h, mi) - 330 * 60_000);
  if (Number.isNaN(utc.getTime()))
    throw new Error(`Not a real date/time: "${input}"`);
  return utc.toISOString().slice(0, 19).replace("T", " ");
}

/** UTC DATETIME string -> "25 Nov 19:42" in Sri Lanka time, for showing. */
function lk(v: unknown): string {
  if (!v) return "";
  const d = new Date(`${String(v).replace(" ", "T")}Z`);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

async function main() {
  const sinceArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!sinceArg)
    throw new Error(
      'Say from when, in Sri Lanka time. Example: npm run db:delete-since -- "2026-11-25 19:00"',
    );
  const since = sriLankaToUtc(sinceArg);
  if (since > new Date().toISOString().slice(0, 19).replace("T", " ")) {
    throw new Error(
      `${sinceArg} (Sri Lanka time) is in the future. Nothing was added after it.`,
    );
  }

  const c = await mysql.createConnection({
    uri: url,
    timezone: "Z",
    dateStrings: true,
  });
  await c.query("SET time_zone = '+00:00'");
  const rl = createInterface({ input: process.stdin, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (prompt: string) => {
    process.stdout.write(prompt);
    const r = await lines.next();
    return r.done ? "" : String(r.value);
  };
  const q = async <T = Row>(sql: string, params: unknown[] = []) =>
    (await c.query(sql, params))[0] as T[];

  try {
    const [{ db }] = await q<{ db: string }>("SELECT DATABASE() AS db");

    // ------------------------------------------------------------ what was added
    const newBookings = await q<{
      id: number;
      booking_no: string;
      status: string;
      created_at: string;
    }>(
      "SELECT id, booking_no, status, created_at FROM bookings WHERE created_at >= ? ORDER BY created_at",
      [since],
    );
    const newInvoices = await q<{
      id: number;
      invoice_no: string;
      booking_id: number;
      created_at: string;
    }>(
      "SELECT i.id, i.invoice_no, i.booking_id, i.created_at FROM invoices i JOIN bookings b ON b.id = i.booking_id WHERE i.created_at >= ? OR b.created_at >= ? ORDER BY i.created_at",
      [since, since],
    );
    const list = async (t: string, label: string, extra = "") =>
      q<{ id: number; label: string; created_at: string }>(
        `SELECT id, ${label} AS label, created_at FROM \`${t}\` WHERE created_at >= ? ${extra} ORDER BY created_at`,
        [since],
      );
    const newCustomers = await list(
      "customers",
      "CONCAT(customer_no, '  ', full_name)",
    );
    const newPatients = await list(
      "patients",
      "CONCAT(patient_no, '  ', full_name)",
    );
    const newEmployees = await list(
      "employees",
      "CONCAT(emp_no, '  ', full_name)",
    );
    const newLeaves = await list(
      "employee_leaves",
      "CONCAT('leave of employee #', employee_id)",
    );
    const newHospitals = await list("hospitals", "name");
    const newPackages = await list("packages", "name", "AND is_default = 0");
    const newUsers = await list("users", "CONCAT(name, ' <', email, '>')");
    const newBranches = await list("branches", "name");
    const newExports = await list("export_logs", "file_name");
    const newLinks = await q<{ n: number }>(
      "SELECT (SELECT COUNT(*) FROM invoice_links WHERE created_at >= ?) + (SELECT COUNT(*) FROM booking_links WHERE created_at >= ?) AS n",
      [since, since],
    );
    const newDrive = await q<{ n: number }>(
      "SELECT COUNT(*) AS n FROM google_drive_connection WHERE connected_at >= ?",
      [since],
    );

    // ------------------------------------------------------------ older bookings changed after the time
    const changedOld = await q<{
      id: number;
      booking_no: string;
      status: Status;
    }>(
      `SELECT DISTINCT b.id, b.booking_no, b.status FROM bookings b JOIN booking_status_logs l ON l.booking_id = b.id
        WHERE b.created_at < ? AND l.created_at >= ? ORDER BY b.id`,
      [since, since],
    );
    const reverts: {
      id: number;
      booking_no: string;
      from: Status;
      to: Status;
      employeeId: number | null;
    }[] = [];
    for (const b of changedOld) {
      const [before] = await q<{ to_status: Status }>(
        "SELECT to_status FROM booking_status_logs WHERE booking_id = ? AND created_at < ? ORDER BY created_at DESC, id DESC LIMIT 1",
        [b.id, since],
      );
      const to: Status = before?.to_status ?? "pending";
      const [assign] = await q<{ employee_id: number | null }>(
        "SELECT employee_id FROM booking_status_logs WHERE booking_id = ? AND to_status = 'assigned' AND created_at < ? ORDER BY created_at DESC, id DESC LIMIT 1",
        [b.id, since],
      );
      const keepsEmployee = [
        "assigned",
        "delivered",
        "invoice_printed",
      ].includes(to);
      reverts.push({
        id: b.id,
        booking_no: b.booking_no,
        from: b.status,
        to,
        employeeId: keepsEmployee ? (assign?.employee_id ?? null) : null,
      });
    }

    // ------------------------------------------------------------ older records only edited (not undone)
    const edited: string[] = [];
    for (const [t, label] of [
      ["customers", "customer_no"],
      ["patients", "patient_no"],
      ["employees", "emp_no"],
      ["packages", "name"],
      ["hospitals", "name"],
      ["branches", "name"],
    ] as const) {
      const rows = await q<{ label: string; updated_at: string }>(
        `SELECT ${label} AS label, updated_at FROM \`${t}\` WHERE created_at < ? AND updated_at >= ?`,
        [since, since],
      ).catch(() => []);
      for (const r of rows)
        edited.push(`${t}: ${r.label} (edited ${lk(r.updated_at)})`);
    }
    const editedBookings = await q<{ booking_no: string; updated_at: string }>(
      `SELECT booking_no, updated_at FROM bookings b WHERE created_at < ? AND updated_at >= ?
         AND NOT EXISTS (SELECT 1 FROM booking_status_logs l WHERE l.booking_id = b.id AND l.created_at >= ?)`,
      [since, since, since],
    );
    for (const r of editedBookings)
      edited.push(`bookings: ${r.booking_no} (edited ${lk(r.updated_at)})`);
    const settingsEdited = await q<{ setting_key: string; updated_at: string }>(
      "SELECT setting_key, updated_at FROM settings WHERE updated_at >= ?",
      [since],
    );
    for (const r of settingsEdited)
      edited.push(`settings: ${r.setting_key} (edited ${lk(r.updated_at)})`);
    const photosChanged = await q<{ emp_no: string; updated_at: string }>(
      "SELECT e.emp_no, p.updated_at FROM employee_photos p JOIN employees e ON e.id = p.employee_id WHERE e.created_at < ? AND p.updated_at >= ?",
      [since, since],
    ).catch(() => []);
    for (const r of photosChanged)
      edited.push(`employee photo: ${r.emp_no} (changed ${lk(r.updated_at)})`);

    // ------------------------------------------------------------ show the plan
    const total =
      newBookings.length +
      newInvoices.length +
      newCustomers.length +
      newPatients.length +
      newEmployees.length +
      newLeaves.length +
      newHospitals.length +
      newPackages.length +
      newUsers.length +
      newBranches.length +
      newExports.length +
      Number(newLinks[0].n) +
      Number(newDrive[0].n) +
      reverts.length;

    console.log(`\nDatabase: ${db}`);
    console.log(`Everything added on or after ${sinceArg} (Sri Lanka time)\n`);
    if (!total) {
      console.log(
        "Nothing was added or changed after that time. Nothing to do.",
      );
      if (edited.length)
        console.log(
          `\nEdited after that time (not undone):\n  ${edited.join("\n  ")}`,
        );
      return;
    }
    const show = (
      title: string,
      rows: { label: string; created_at: string }[],
    ) => {
      if (!rows.length) return;
      console.log(`${title} (${rows.length}):`);
      for (const r of rows.slice(0, 15))
        console.log(`  ${lk(r.created_at)}  ${r.label}`);
      if (rows.length > 15) console.log(`  … and ${rows.length - 15} more`);
    };
    console.log("WILL BE DELETED:");
    show(
      "Bookings",
      newBookings.map((b) => ({
        label: `${b.booking_no}  (${b.status})`,
        created_at: b.created_at,
      })),
    );
    show(
      "Invoices",
      newInvoices.map((i) => ({
        label: i.invoice_no,
        created_at: i.created_at,
      })),
    );
    show("Customers", newCustomers);
    show("Patients", newPatients);
    show("Employees", newEmployees);
    show("Leave records", newLeaves);
    show("Hospitals", newHospitals);
    show("Packages", newPackages);
    show("Logins", newUsers);
    show("Branches", newBranches);
    show("Excel export log", newExports);
    if (Number(newLinks[0].n))
      console.log(`WhatsApp invoice / booking links: ${newLinks[0].n}`);
    if (Number(newDrive[0].n))
      console.log("Google Drive connection (connected after that time)");
    if (reverts.length) {
      console.log(
        `\nOLDER BOOKINGS PUT BACK to how they were at ${sinceArg} (${reverts.length}):`,
      );
      for (const r of reverts)
        console.log(`  ${r.booking_no}: ${r.from} -> ${r.to}`);
    }
    if (edited.length)
      console.log(
        `\nEdited after that time, NOT undone (check by hand if needed):\n  ${edited.join("\n  ")}`,
      );
    console.log("");

    const answer = await ask(
      "A backup is made first. Type DELETE to go ahead, anything else to cancel: ",
    );
    if (answer.trim() !== "DELETE") {
      console.log("Cancelled. Nothing was changed.");
      return;
    }

    // ------------------------------------------------------------ 1. backup
    const file = await backup(c, db);
    console.log(`✔ Backup written: ${file}`);

    // ------------------------------------------------------------ 2. delete / undo
    const ids = (rows: { id: number }[]) =>
      rows.length ? rows.map((r) => r.id) : [0];
    await c.beginTransaction();
    try {
      // links and invoices first (links of deleted invoices go with them)
      await c.query("DELETE FROM invoice_links WHERE created_at >= ?", [since]);
      await c.query("DELETE FROM booking_links WHERE created_at >= ?", [since]);
      await c.query("DELETE FROM invoices WHERE id IN (?)", [ids(newInvoices)]);
      // history after the time, then put older bookings back
      await c.query("DELETE FROM booking_status_logs WHERE created_at >= ?", [
        since,
      ]);
      for (const r of reverts) {
        const clear = (col: string, byCol: string) =>
          `${byCol} = IF(${col} >= ?, NULL, ${byCol}), ${col} = IF(${col} >= ?, NULL, ${col})`; // MySQL sets columns left to right: "by" first;
        await c.query(
          `UPDATE bookings SET ${clear("confirmed_at", "confirmed_by")}, ${clear("ignored_at", "ignored_by")},
             ${clear("assigned_at", "assigned_by")}, ${clear("delivered_at", "delivered_by")} WHERE id = ?`,
          [since, since, since, since, since, since, since, since, r.id],
        );
        // employee/branch are set together; status last so the double-booking guard sees the final values
        await c.query(
          "UPDATE bookings b LEFT JOIN employees e ON e.id = ? SET b.employee_id = e.id, b.branch_id = e.branch_id, b.status = ? WHERE b.id = ?",
          [r.employeeId, r.to, r.id],
        );
      }
      await c.query("DELETE FROM bookings WHERE id IN (?)", [ids(newBookings)]);
      await c.query("DELETE FROM patients WHERE id IN (?)", [ids(newPatients)]);
      await c.query("DELETE FROM customers WHERE id IN (?)", [
        ids(newCustomers),
      ]);
      await c.query("DELETE FROM employee_leaves WHERE id IN (?)", [
        ids(newLeaves),
      ]);
      await c.query("DELETE FROM employees WHERE id IN (?)", [
        ids(newEmployees),
      ]);
      await c.query("DELETE FROM hospitals WHERE id IN (?)", [
        ids(newHospitals),
      ]);
      await c.query("DELETE FROM packages WHERE id IN (?)", [ids(newPackages)]);
      await c.query("DELETE FROM export_logs WHERE created_at >= ?", [since]);
      await c.query(
        "DELETE FROM google_drive_connection WHERE connected_at >= ?",
        [since],
      );
      // logins and branches last (other rows point at them)
      const userIds = ids(newUsers);
      await c.query(
        "UPDATE settings SET updated_by = NULL WHERE updated_by IN (?)",
        [userIds],
      );
      await c.query(
        "UPDATE branches SET manager_user_id = NULL WHERE manager_user_id IN (?)",
        [userIds],
      );
      await c.query("DELETE FROM users WHERE id IN (?)", [userIds]);
      await c.query("DELETE FROM branches WHERE id IN (?)", [ids(newBranches)]);

      // numbering continues from what is left (no gaps): CUS, PAT, EMP, BK-year, INV-year
      const num = (col: string) =>
        `CAST(SUBSTRING_INDEX(${col}, '-', -1) AS UNSIGNED)`;
      const yr = (col: string) =>
        `CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(${col}, '-', 2), '-', -1) AS UNSIGNED)`;
      for (const [name, t, col] of [
        ["customer", "customers", "customer_no"],
        ["patient", "patients", "patient_no"],
        ["employee", "employees", "emp_no"],
      ]) {
        await c.query(
          `UPDATE sequences SET \`last_value\` = (SELECT COALESCE(MAX(${num(col)}), 0) FROM \`${t}\`) WHERE \`name\` = ? AND \`year\` = 0`,
          [name],
        );
      }
      for (const [name, t, col] of [
        ["booking", "bookings", "booking_no"],
        ["invoice", "invoices", "invoice_no"],
      ]) {
        await c.query(
          `UPDATE sequences s SET s.\`last_value\` = (SELECT COALESCE(MAX(${num(col)}), 0) FROM \`${t}\` WHERE ${yr(col)} = s.\`year\`) WHERE s.\`name\` = ?`,
          [name],
        );
      }
      await c.commit();
    } catch (e) {
      await c.rollback();
      throw new Error(
        `Nothing was changed (rolled back). Reason: ${e instanceof Error ? e.message : e}`,
      );
    }

    console.log("✔ Done. Data added after that time was deleted.");
    console.log(`To undo: mysql -u root -p ${db} < "${file}"`);
  } finally {
    rl.close();
    await c.end();
  }
}

/** Every row of every table as INSERT statements (restorable with the mysql client or SOURCE). */
async function backup(c: mysql.Connection, db: string) {
  const [tables] = (await c.query(
    "SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
  )) as unknown as [{ t: string }[]];
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
    const [rows] = (await c.query(
      `SELECT ${names.map((n) => `\`${n}\``).join(", ")} FROM \`${t}\``,
    )) as unknown as [Row[]];
    out.push(`DELETE FROM \`${t}\`;`);
    for (const r of rows)
      out.push(
        `INSERT INTO \`${t}\` (${names.map((n) => `\`${n}\``).join(", ")}) VALUES (${names.map((n) => c.escape(r[n])).join(", ")});`,
      );
    out.push("");
  }
  out.push("SET FOREIGN_KEY_CHECKS = 1;", "");
  const dir = join(process.cwd(), "backups");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .slice(0, 15);
  const file = join(dir, `${db}-before-delete-since-${stamp}.sql`);
  writeFileSync(file, out.join("\n"), "utf8");
  return file;
}

main().catch((e) => {
  console.error(`✘ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
