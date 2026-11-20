/**
 * Create (or reset) a login from the terminal.
 *
 *   npm run create-user -- --email admin@company.lk --name "System Admin" --password "Admin@1234"
 *   npm run create-user -- --email mgr@company.lk --name "Kadawatha Manager" --password "Pass@1234" --role branch_manager --branch 1
 *
 * If the email already exists, its password/role/branch are updated (handy if you forget a password).
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { parseArgs } from "node:util";
import { USER_ROLES, users, type UserRole } from "../src/db/schema";

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      password: { type: "string" },
      role: { type: "string", default: "admin" },
      branch: { type: "string" },
    },
  });

  const email = values.email?.trim().toLowerCase();
  const role = values.role as UserRole;
  if (!email || !values.name || !values.password) {
    throw new Error('Usage: npm run create-user -- --email a@b.lk --name "Name" --password "Secret123" [--role admin|call_center|branch_manager] [--branch 1]');
  }
  if (!USER_ROLES.includes(role)) throw new Error(`--role must be one of: ${USER_ROLES.join(", ")}`);
  if (values.password.length < 8) throw new Error("Password must be at least 8 characters.");
  const branchId = values.branch ? Number(values.branch) : null;
  if (role === "branch_manager" && !branchId) throw new Error("A branch_manager needs --branch <branch id>.");

  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing. Check .env.local");
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL });
  const db = drizzle(pool);

  const passwordHash = await bcrypt.hash(values.password, 10);
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);

  if (existing) {
    await db.update(users).set({ name: values.name, passwordHash, role, branchId, isActive: true }).where(eq(users.id, existing.id));
    console.log(`✔ Updated user #${existing.id} (${email}) — role: ${role}`);
  } else {
    const [res] = await db.insert(users).values({ name: values.name, email, passwordHash, role, branchId });
    console.log(`✔ Created user #${res.insertId} (${email}) — role: ${role}`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error("✖", err instanceof Error ? err.message : err);
  process.exit(1);
});
