/**
 * Checks the database connection using the same DATABASE_URL as the app.
 *
 *   npm run db:check
 */
import mysql from "mysql2/promise";
import { is } from "drizzle-orm";
import { getTableConfig, MySqlTable } from "drizzle-orm/mysql-core";
import * as schema from "../src/db/schema";

const EXPECTED_TABLES = [
  "booking_status_logs", "bookings", "branches", "customers", "employee_leaves", "employees",
  "hospitals", "invoices", "patients", "sequences", "settings", "users",
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is missing. Create .env.local (copy .env.example) and fill it in.");

  const safeUrl = url.replace(/:\/\/([^:]+):[^@]*@/, "://$1:****@");
  console.log(`Connecting to ${safeUrl} ...`);

  const started = Date.now();
  const conn = await mysql.createConnection({ uri: url, connectTimeout: 5000 });
  const [[info]] = (await conn.query("SELECT VERSION() AS version, DATABASE() AS db, NOW() AS now")) as unknown as [
    { version: string; db: string; now: Date }[],
  ];
  console.log(`✔ Connected in ${Date.now() - started} ms — MySQL ${info.version}, database "${info.db}"`);

  const [tables] = (await conn.query("SHOW TABLES")) as unknown as [Record<string, string>[]];
  const names = tables.map((t) => Object.values(t)[0]);
  const missing = EXPECTED_TABLES.filter((t) => !names.includes(t));
  if (missing.length) {
    console.log(`✖ Missing tables: ${missing.join(", ")}`);
    console.log("  Run: mysql -u root -p < database/care_booking_schema.sql");
  } else {
    console.log(`✔ All ${EXPECTED_TABLES.length} tables found`);
  }

  for (const t of EXPECTED_TABLES.filter((x) => names.includes(x))) {
    const [[row]] = (await conn.query(`SELECT COUNT(*) AS n FROM \`${t}\``)) as unknown as [{ n: number }[]];
    console.log(`   ${t.padEnd(20)} ${row.n} rows`);
  }

  await compareWithDrizzle(conn);

  if (names.includes("users")) {
    const [[admins]] = (await conn.query("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND is_active=1")) as unknown as [
      { n: number }[],
    ];
    if (admins.n === 0) console.log('! No admin login yet. Run: npm run create-user -- --email ... --name "..." --password "..."');
  }

  await conn.end();
}

/**
 * Compares every table in src/db/schema.ts with the real database:
 * columns, types, NULL / NOT NULL, and index names.
 */
async function compareWithDrizzle(conn: mysql.Connection) {
  const tables = (Object.values(schema) as unknown[]).filter((v): v is MySqlTable => is(v, MySqlTable));
  const [dbCols] = (await conn.query(
    "SELECT TABLE_NAME AS t, COLUMN_NAME AS c, COLUMN_TYPE AS type, IS_NULLABLE AS nullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()",
  )) as unknown as [{ t: string; c: string; type: string; nullable: string }[]];
  const [dbIdx] = (await conn.query(
    "SELECT DISTINCT TABLE_NAME AS t, INDEX_NAME AS i, NON_UNIQUE AS nonUnique FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()",
  )) as unknown as [{ t: string; i: string; nonUnique: number }[]];

  // MySQL 8 shows "int unsigned", older servers "int(10) unsigned"; booleans are tinyint(1).
  const normalize = (type: string) =>
    type
      .toLowerCase()
      .replace(/^tinyint\(1\)$/, "boolean")
      .replace(/^(tinyint|smallint|mediumint|int|bigint)\(\d+\)/, "$1")
      .replace(/\s+/g, " ")
      .trim();

  const problems: string[] = [];
  for (const table of tables) {
    const cfg = getTableConfig(table);
    const cols = dbCols.filter((r) => r.t === cfg.name);
    if (cols.length === 0) continue; // already reported as a missing table

    for (const col of cfg.columns) {
      const dbCol = cols.find((r) => r.c === col.name);
      if (!dbCol) {
        problems.push(`${cfg.name}.${col.name}: missing in the database`);
        continue;
      }
      const want = normalize(col.getSQLType());
      const have = normalize(dbCol.type);
      if (want !== have) problems.push(`${cfg.name}.${col.name}: type is ${have}, schema.ts expects ${want}`);
      const dbNotNull = dbCol.nullable === "NO";
      if (dbNotNull !== col.notNull) {
        problems.push(`${cfg.name}.${col.name}: database is ${dbNotNull ? "NOT NULL" : "NULL"}, schema.ts expects ${col.notNull ? "NOT NULL" : "NULL"}`);
      }
    }
    for (const dbCol of cols) {
      if (!cfg.columns.some((c) => c.name === dbCol.c)) problems.push(`${cfg.name}.${dbCol.c}: in the database but not in schema.ts`);
    }
    for (const idx of cfg.indexes) {
      const name = idx.config.name;
      const found = dbIdx.find((r) => r.t === cfg.name && r.i === name);
      if (!found) problems.push(`${cfg.name}: index ${name} missing in the database`);
      else if ((found.nonUnique === 0) !== Boolean(idx.config.unique)) problems.push(`${cfg.name}: index ${name} unique/non-unique mismatch`);
    }
  }

  if (problems.length === 0) {
    console.log(`✔ Columns, types and indexes match src/db/schema.ts (${tables.length} tables)`);
  } else {
    console.log(`✖ ${problems.length} difference(s) between the database and src/db/schema.ts:`);
    for (const p of problems) console.log(`   - ${p}`);
  }
}

main().catch((err: { code?: string; message?: string }) => {
  const hints: Record<string, string> = {
    ECONNREFUSED: "MySQL is not running, or the port is wrong. Start the MySQL service (net start MySQL80).",
    ER_ACCESS_DENIED_ERROR: "Wrong user or password in DATABASE_URL. Remember: @ → %40, # → %23 in the password.",
    ER_BAD_DB_ERROR: "The database doesn't exist yet. Run: mysql -u root -p < database/care_booking_schema.sql",
    ETIMEDOUT: "Could not reach the MySQL host. Check the host and port in DATABASE_URL.",
    ENOTFOUND: "Unknown host in DATABASE_URL. Use 127.0.0.1 for your own computer.",
    ERR_INVALID_URL: "DATABASE_URL is not a valid URL. Encode special characters in the password (@ → %40, # → %23).",
  };
  console.error(`✖ Database check failed: ${err.code ?? ""} ${err.message ?? err}`);
  if (err.code && hints[err.code]) console.error(`  → ${hints[err.code]}`);
  else if (err.message?.includes("URI malformed")) console.error("  → Special characters in the password must be encoded (@ → %40, # → %23).");
  process.exit(1);
});
