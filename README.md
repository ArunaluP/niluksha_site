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
| `npm run db:reset [-- --keep director@company.lk]` | **Clear the database before going live.** Keeps one Director login, the default package and the company settings; deletes everything else (bookings, invoices, customers, employees, branches, hospitals, other packages and logins, export log, Drive connection) and restarts numbering. Makes a full backup in `backups/` first and asks you to type `RESET`. Undo: `mysql -u root -p care_booking < backups/<file>.sql` |
| `npm run db:delete-since -- "2026-11-25 19:00"` | **Remove data added after a time** (Sri Lanka time). Deletes bookings, invoices, customers, patients, employees, leave, hospitals, packages, logins, branches and export-log rows added after it, and puts older bookings back to the step they were at (undoes confirm / assign / deliver done after it). Numbering continues from what is left. Shows the list first, makes a backup in `backups/`, and asks you to type `DELETE`. Plain edits to older records are listed, not undone. |

## Screens

| Screen | Who | What |
|---|---|---|
| Dashboard | everyone | Today's bookings, 7-day outlook, free caregivers, invoices waiting, recent activity |
| Sidebar + search | everyone | The menu collapses to icons (button beside the company name, or **Ctrl+B**; remembered per browser; names show on hover). **Search** (or **Ctrl+K**) finds pages, bookings (BK no, patient / customer name, phone), customers (name, phone, NIC, customer no) and employees (name, EMP no, file no, phone) — only what the user may open. ↑ ↓ Enter to go |
| Reports | everyone | Landing page with two cards: **Customer Reports** (`/reports/activity`) and **Employee Reports** (`/reports/employees`) |
| Bookings for several days | call center, Director | New booking → Session: pick the **package** and the **number of days** (1-30, − / +); it shows the dates and **price × days**. One caregiver for all days (free on every day). Days can be changed until delivered (also after assignment: **Change days**). Deliver on/after the last day; the invoice is price × days. Employee report counts each day as a session |
| Invoice on WhatsApp | Director, call center, branch managers (own branch) | Customer form: a **WhatsApp** tick in front of Phone and Other phone (on by default); untick both and a **WhatsApp number** box appears (optional). After **Mark printed**, the invoice has **Send on WhatsApp**: it opens WhatsApp with the customer's number and a message with all the invoice details plus a secret link (works **7 days**) to a page with **Download PDF** / **View PDF**. "Disable links" stops them at once. Needs Settings → **Public web address** (without it the message has no link). **PDF** button on every invoice |
| Booking on WhatsApp + print | everyone (managers: new bookings + own branch) | Right after **Record booking** (and on every booking page): **Send on WhatsApp** opens WhatsApp with the customer's number and a message with the booking details, the status (received / confirmed / caregiver), the **estimated amount** (package price × days; the invoice is the final bill) and a secret 7-day link to a page with **Download PDF** / **View PDF** (`/b/…`). **Print booking** opens an A4 **Booking confirmation** for the customer (Print / Save PDF, PDF button). Cancelled bookings can't be sent |
| Excel export | everyone (download or Google Drive) | **Excel** on Customer Reports, Employee Reports and one employee: a pop-up to **download**, **save to Google Drive** or **both**. Real `.xlsx` with every row. Drive setup: `docs/GOOGLE_DRIVE_SETUP.md`; Settings shows the connection and recent exports. **Print** on all three |
| Employee Reports | everyone (managers: own branch; Director: branch filter) | Employees ranked by **finished sessions** (invoice printed) in a period, by service date; tie → worked most recently. Period presets (today … last 90 days, custom) + daily/weekly bar chart. Click a row → `/reports/employees/EMP-0007`: that employee's finished sessions, totals and a daily chart |
| Customer Reports | everyone (managers: own branch; Director: branch filter) | Everything that happened in a day or date range: counts per event type, delivered / printed value, breakdown by branch and package, every event with the booking's current status. Print (all events, white page) and Download CSV |
| Booking journey | everyone (managers: own branch) | Click a Reports row: a side panel (`?view=BK-…`) shows the booking's whole flow (booked → confirmed → assigned → delivered → invoice printed) with who / when / how long, plus detours (ignored with reason, reassigned from → to, unassigned). "Open full page" goes to the booking page with "← Back to Reports" |
| Call List | Director, Call center, Branch managers | Today / tomorrow / any date: Confirm or Ignore (with reason), then Assign. Managers see every new booking (no branch yet) plus their branch's |
| New Booking | Director, Call center, Branch managers | 3 steps: find or register customer → choose or add patient → session details |
| Assignments | Director, Call center, Branch managers | Confirmed bookings needing an employee; reassign / unassign. Branch managers can assign **only their own branch's** caregivers / nurses; once assigned, the booking belongs to that branch and other managers no longer see it |
| Bookings | everyone (managers: new bookings + own branch) | Filter by status, dates, search; booking page at `/bookings/BK-2026-00018` (old `/bookings/12` links redirect) with the journey, side cards and every workflow button |
| Invoices | everyone (managers: own branch) | Waiting / printed; white printable invoice, Print / Save PDF, Mark printed |
| Customers | Director, Call center, Branch managers (all customers) | Search, profile, patients, recent bookings |
| Employees | Director edits all; branch managers register / edit their own branch (Branch fixed, can set inactive) + leave; call center views | Filters by type and branch, leave records, upcoming sessions. **Register employee** is a full-page form copied from the company's paper registration form (in English): how they heard about us (+ referring employee), **Employee number** from the paper form (EMP-0001 stays as the system number), personal details (no middle name), Grama Niladhari division, district, nearest police / post office, guardian details, documents received (ticks), the rules & declaration with an "agreed" tick (time + login recorded), and a **webcam photo** (or choose a file). **Print form** gives the filled form on one A4 page with signature lines for the recruiting officer and the employee |
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

**Finished sessions for the reports:** `database/sample_sessions.sql` (run with `SOURCE` in mysql, TEST databases only) adds about 60 days of past sessions that went through the whole flow up to invoice printed, so Employee Reports and its charts have data. The file explains how to remove them again.

`npm run seed:staff` only adds sample **branches, employees and hospitals** (6 branches, 21 staff, 16 hospitals).
It works on a database that already has data and can be run again safely: existing branch codes, employees and
hospitals (same name + city) are skipped.

## REST API

See **docs/API.md** for every endpoint, and import **docs/care-booking.postman_collection.json**
into Postman (set the `adminEmail` / `adminPassword` collection variables to your admin login).

## How the backend is organised

```
src/
  features/<module>/     Business logic per module (service.ts): branches, users, hospitals,
                         employees, customers, bookings (+ status.ts life cycle), invoices, dashboard,
                         reports (events.ts = the from→to event mapping, csv.ts)
  app/api/**/route.ts    REST endpoints — thin: validate input, call the service, return JSON
  proxy.ts               Route guard (Next 16's name for middleware). Cookie check only:
                         logged-out users -> /login, logged-in users skip /login.
  db/
    schema.ts            Drizzle tables (mirrors database/care_booking_schema.sql)
    index.ts             MySQL connection pool + `db`
  lib/
    session.ts           Signed login cookie (jose, 12-hour session)
    dal.ts               SECURE checks: getCurrentUser(), requireUser(), requirePermission()
    permissions.ts       Role -> permission map, branchScope() / bookingScope() / assignableBranch() for branch managers
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
3. **Every query a branch manager can reach** adds `branchScope(user, table.branchId)` to its `where` (bookings: `bookingScope(...)`, which also lets managers see new bookings that have no branch yet; assigning: `assignableBranch(user)`).
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
| `008_report_index.sql` | Index `idx_logs_created` on `booking_status_logs.created_at` for the Reports page (no data changes). |
| `009_log_employee.sql` | `booking_status_logs.employee_id`: which employee each assignment was for (shows reassignments as "from → to" on the booking journey). Backfills the latest assignment of each booking from its current employee; older reassignments stay "employee not recorded". |
| `010_drive_exports.sql` | Tables `google_drive_connection` (the Google account the Director connected, encrypted key, export folder) and `export_logs` (every Excel export). |
| `011_times_utc.sql` | All times are stored in **UTC** (screens show Sri Lanka time). Moves the times MySQL filled in itself (`created_at`, unchanged `updated_at`) back by 5 h 30 min. Runs once (marker: setting `db_time_zone`). |
| `012_whatsapp.sql` | Customers: WhatsApp ticks for phone / other phone (on by default) and a separate `whatsapp_phone`. Table `invoice_links` (secret 7-day invoice links sent on WhatsApp; only a SHA-256 of the secret is stored). |
| `013_booking_days.sql` | `bookings.days` (1-30 days in a row, default 1) and `end_date` (worked out by MySQL). Invoice = package price × days. |
| `014_employee_registration.sql` | Employee registration form: `file_no` (employee number on the paper form, unique), GN division, district, nearest police / post office, guardian name / relationship / address / phone, 5 document ticks, `heard_from` + `referred_by`, `rules_agreed_at` / `rules_agreed_by`, and the `employee_photos` table (one JPEG per employee, kept in MySQL so backups include it). |
| `015_booking_links.sql` | `booking_links`: secret 7-day links to a booking confirmation sent on WhatsApp (same rules as `invoice_links`). |

```sql
mysql> SOURCE D:/Niluksha_system/database/migrations/002_split_names.sql;
```
Then run `npm run db:check` to confirm the database matches the code.
