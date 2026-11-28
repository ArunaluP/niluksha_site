import "server-only";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

/**
 * One shared MySQL connection pool for the whole app.
 * In development, Next.js reloads modules on every save — keeping the pool on
 * globalThis stops it from opening a new pool (and new connections) each time.
 */
const globalForDb = globalThis as unknown as { mysqlPool?: mysql.Pool };

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Add it to .env.local");
  const pool = mysql.createPool({
    uri: url,
    connectionLimit: 10,
    // All DATETIME values are stored in UTC (Drizzle writes and reads them as UTC).
    // Screens show them in Sri Lanka time; "today"/date ranges use src/lib/dates.ts.
    timezone: "Z",
    dateStrings: ["DATE"], // keep DATE columns as 'YYYY-MM-DD' strings
  });
  // Times MySQL fills in itself (DEFAULT / ON UPDATE CURRENT_TIMESTAMP) must be UTC too.
  pool.on("connection", (conn) => {
    conn.query("SET time_zone = '+00:00'");
  });
  return pool;
}

export const pool = globalForDb.mysqlPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.mysqlPool = pool;

export const db = drizzle(pool, { schema, mode: "default" });

/** Transaction type, for helpers that must run inside db.transaction(). */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export { schema };
