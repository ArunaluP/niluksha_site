# Care Booking System (Phase 1)

Caregiver booking system for Niluksha: Next.js 16 + TypeScript + MySQL 8 + Drizzle ORM.

## First-time setup (Windows)

```bash
cd D:\Niluksha_system
npm install
```

1. **Create the database** (once). MySQL must be running.
   ```bash
   mysql -u root -p < database/care_booking_schema.sql
   ```
2. **Edit `.env.local`**: put your MySQL root password in `DATABASE_URL`.
   Special characters in the password must be URL-encoded (`@` → `%40`, `#` → `%23`).
3. **Create the first admin login**:
   ```bash
   npm run create-user -- --email admin@company.lk --name "System Admin" --password "Admin@1234"
   ```
4. **Run it**:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000 and sign in.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server (auto-reloads) |
| `npm run build` then `npm start` | Production build and run |
| `npm run typecheck` | Check TypeScript types |
| `npm run lint` | Check code style |
| `npm run create-user -- --email … --name "…" --password "…" [--role admin\|call_center\|branch_manager] [--branch 1]` | Create a login, or reset an existing one's password |

## Screens

| Screen | Who | What |
|---|---|---|
| Dashboard | everyone | Today's bookings, 7-day outlook, free caregivers, invoices waiting, recent activity |
| Call List | Director, Call center | Today / tomorrow / any date: Confirm or Ignore (with reason), then Assign |
| New Booking | Director, Call center | 3 steps: find or register customer → choose or add patient → session details |
| Assignments | Director, Call center | Confirmed bookings needing an employee; reassign / unassign |
| Bookings | everyone (managers: own branch) | Filter by status, dates, search; detail page with history and every workflow button |
| Invoices | everyone (managers: view only) | Waiting / printed; white printable invoice, Print / Save PDF, Mark printed |
| Customers | Director, Call center | Search, profile, patients, recent bookings |
| Employees | Director edits; others view | Filters by type and branch, leave records, upcoming sessions |
| Hospitals, Branches, Users, Packages, Settings | Director | Master data, logins, care packages (hours + price), company details |

Design: light glassmorphism (frosted panels over a soft lavender background); the invoice prints on plain white.
Screens use **server actions** (`src/app/(app)/_actions/*`) that call the same services as the REST API.

### Demo data (test databases only)

```bash
npm run dev                      # terminal 1
npm run seed:demo                # terminal 2 — needs an EMPTY database with one Director login
```
Uses `ADMIN_EMAIL` / `ADMIN_PASSWORD` (defaults `admin@test.lk` / `Admin@1234`). Creates 3 branches, 10 staff,
3 hospitals, 6 customers and a week of bookings, plus logins `call@demo.lk` / `Call@1234` and
`mgr.kdw@demo.lk` / `Mgr@12345`.

## REST API

See **docs/API.md** for every endpoint, and import **docs/care-booking.postman_collection.json**
into Postman (set the `adminEmail` / `adminPassword` collection variables to your admin login).

## How the backend is organised

```
src/
  features/<module>/     Business logic per module (service.ts): branches, users, hospitals,
                         employees, customers, bookings (+ status.ts life cycle), invoices, dashboard
  app/api/**/route.ts    REST endpoints — thin: validate input, call the service, return JSON
  proxy.ts               Route guard (Next 16's name for middleware). Cookie check only:
                         logged-out users -> /login, logged-in users skip /login.
  db/
    schema.ts            Drizzle tables (mirrors database/care_booking_schema.sql)
    index.ts             MySQL connection pool + `db`
  lib/
    session.ts           Signed login cookie (jose, 12-hour session)
    dal.ts               SECURE checks: getCurrentUser(), requireUser(), requirePermission()
    permissions.ts       Role -> permission map, branchScope() for branch managers
    api.ts               api() wrapper for REST routes: 401/403 + JSON errors (400/404/409)
    validation.ts        Shared Zod rules (phone, NIC, dates, pagination)
    action.ts            protectedAction(): login + permission + Zod validation + friendly errors
    errors.ts            AppError + MySQL error -> user message (e.g. double booking)
    sequences.ts         Running numbers: CUS-00001, BK-2026-00001, INV-2026-00001
    dates.ts             today()/tomorrow() in Sri Lanka time
    settings.ts          Read settings (company details for invoices)
    rate-limit.ts        5 wrong passwords per email -> locked 15 minutes
  app/
    (auth)/login/        Login page, form and login/logout actions
    (app)/layout.tsx     Logged-in shell: glass sidebar filtered by role (menu bar on phones)
    (app)/<screen>/      One folder per screen (dashboard, call-list, bookings, invoices, …)
    (app)/_actions/      Server actions used by the screens
  components/ui/         Design system: Card, Button, Field, StatusBadge, Table, Dialog…
  components/app/        Shared screen parts: assign dialog, entity form dialog, tabs, pager
scripts/create-user.ts   Create/reset logins from the terminal
database/                The SQL script that creates the database
```

### Security rules (follow these in every new module)

1. **Every page** starts with `await requireUser()` or `await requirePermission("…")`.
2. **Every server action** is wrapped in `protectedAction({ permission, schema }, handler)`.
3. **Every query a branch manager can reach** adds `branchScope(user, table.branchId)` to its `where`.
4. Business-rule failures: `throw new AppError("message the user sees")`.
5. Creating numbered records: call `nextNumber(tx, "booking")` **inside** `db.transaction()`.

### Example: a server action

```ts
"use server";
import * as z from "zod";
import { db } from "@/db";
import { branches } from "@/db/schema";
import { protectedAction } from "@/lib/action";

const BranchSchema = z.object({
  code: z.string().trim().min(2).max(20),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(20).optional(),
});

export const createBranch = protectedAction(
  { permission: "manageBranches", schema: BranchSchema },
  async (input) => {
    const [res] = await db.insert(branches).values(input);
    return { id: res.insertId };
  },
);
```

## Database changes

The database is created by `database/care_booking_schema.sql`, and `src/db/schema.ts` mirrors it.
If you add or change a column, update **both**. Do **not** run `drizzle-kit push` against the real
database: it would remove the automatic `ON UPDATE` on the `updated_at` columns.

### Migrations (existing databases)

A new install only needs `care_booking_schema.sql`. A database created **before** a change needs
the matching file in `database/migrations/`, run once, in order:

| File | Change |
|---|---|
| `002_split_names.sql` | Employees, customers and patients get `first_name`, `middle_name`, `last_name`. `full_name` becomes a generated column ("first middle last") used for display and search. |
| `003_customer_dob.sql` | Customers get a date of birth. Fills it (and corrects employees' date of birth and gender) from the NIC, because the app now requires them to match the NIC. |
| `004_relationship_other.sql` | Patients get `relationship_other`: the real relationship (e.g. Grandmother) when the relationship is "Other". |
| `005_email.sql` | Optional `email` for customers and employees. |
| `006_ward_bed.sql` | Hospital bookings: `ward_room` is split into `ward_no` (required) and `bed_no` (optional); old text moves to `ward_no`. |
| `007_packages.sql` | Care packages. The current session rate becomes the default package "Standard 24 hours"; existing bookings are linked to it; the old session-rate setting is removed. |

```sql
mysql> SOURCE D:/Niluksha_system/database/migrations/002_split_names.sql;
```
Then run `npm run db:check` to confirm the database matches the code.
