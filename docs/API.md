# Care Booking API — Phase 1

Base URL (development): `http://localhost:3000`
All requests and responses are JSON. Import `docs/care-booking.postman_collection.json` into Postman to try everything.

## How it works

**Login first.** `POST /api/auth/login` sets an httpOnly cookie (`cb_session`, 12 hours). Postman and browsers send it automatically.

**Every response has the same shape**

```json
{ "ok": true,  "data": { ... } }
{ "ok": false, "error": "Message to show the user", "fieldErrors": { "phone": ["Enter a valid phone number…"] } }
```

| Status | Meaning |
|---|---|
| 200 / 201 | OK / created |
| 400 | Invalid input (`fieldErrors` says which field) or a business rule (e.g. past date) |
| 401 | Not logged in, session expired, or user disabled |
| 403 | Logged in, but your role may not do this |
| 404 | Not found (or belongs to another branch) |
| 409 | Conflict: wrong status for this step, duplicate, or employee already booked |
| 429 | Too many wrong passwords (locked 15 minutes) |

**Lists** accept `?page=1&pageSize=20` (max 100) and return `{ items, total, page, pageSize }`.
**Dates** are `YYYY-MM-DD`, times `HH:MM` (24-hour), all in Sri Lanka time. Money is a string: `"4500.00"`.

## Booking life cycle

```
pending ──confirm──▶ confirmed ──assign──▶ assigned ──deliver──▶ delivered ──mark-printed──▶ invoice_printed
   │                    │  ▲                 │  │                  (invoice created here)
   │                    │  └───unassign──────┘  └── assign again = reassign
   └──────ignore────────┴───────ignore───────┘──▶ ignored  (frees the employee)
```

- Bookings can only be created for **today or later**.
- Details can be edited only while **pending** or **confirmed**.
- **Free employee** on a date = active, not on leave, not already assigned/delivered that day (any branch).
- **Deliver** is allowed on or after the service date. It creates the invoice: `amount = booking rate × 1`.
- The booking's **branch** = the assigned employee's branch. A new booking has **no branch** until it is assigned: every branch manager sees those (to call, confirm, edit or cancel), plus the bookings of their own branch. Bookings and invoices of another branch → 404 / 403.

## Roles

"admin" in the database is shown as **Director** in the app.

| Permission | Director | Call center | Branch manager |
|---|:-:|:-:|:-:|
| Users, branches, hospitals, packages, settings (write) | ✔ | | |
| Employees + leave (register / edit / active-inactive) | ✔ | | ✔ own branch (branch fixed) |
| View branches / hospitals / employees / settings | ✔ | ✔ | ✔ own branch |
| Customers + patients (company-wide) | ✔ | ✔ | ✔ |
| Create / edit bookings, call list, confirm, ignore | ✔ | ✔ | ✔ new bookings (no branch) + own branch |
| Assign / reassign / unassign, available employees | ✔ any branch | ✔ any branch | ✔ **own branch's employees only** (403 otherwise) |
| Deliver, print invoices, mark printed | ✔ | ✔ | ✔ own branch |
| WhatsApp invoice / booking | ✔ | ✔ | ✔ own branch + new bookings |
| Excel export to Google Drive | ✔ | ✔ | ✔ (own-branch data) |
| View bookings, invoices, dashboard | ✔ all | ✔ all | ✔ own branch + new bookings (invoices: own branch) |

**Employee types:** Caregiver, Nurse, Branch Manager, Call Center, Manager.
Only **Caregivers and Nurses** appear as free employees and can be assigned to patients.

## Endpoints

### Auth
| Method | URL | Body |
|---|---|---|
| POST | `/api/auth/login` | `{ email, password }` |
| POST | `/api/auth/logout` | – |
| GET | `/api/auth/me` | – returns user + permission list |

### Main workflow
| Method | URL | Body / query | Step |
|---|---|---|---|
| GET | `/api/customers?q=0771234567` | q = phone, NIC, name or CUS no | Find caller |
| POST | `/api/customers` | `{ firstName, middleName?, lastName, phone, nic?, altPhone?, phoneWhatsapp? (default true), altPhoneWhatsapp? (default true), whatsappPhone? (07X mobile, kept only when neither ticked phone has a number), email?, address?, city?, notes?, patients?: [{ firstName, middleName?, lastName, gender, relationship?, relationshipOther?, dob?, address?, careNotes? }] }` | New customer |
| GET | `/api/customers/:id` | – | Profile + patients + recent bookings |
| POST | `/api/customers/:id/patients` | `{ firstName, middleName?, lastName, gender, relationship?, relationshipOther?, dob?, address?, careNotes? }` | Add patient |
| POST | `/api/bookings` | `{ customerId, patientId, serviceDate, days? (1-30, default 1), startTime?, packageId?, locationType: "home"\|"hospital", hospitalId?, wardNo?, bedNo?, serviceAddress?, notes? }` | Record booking |
| PATCH | `/api/bookings/:id` | any of `patientId, serviceDate, days, startTime, packageId, locationType, hospitalId, wardNo, bedNo, serviceAddress, notes` | Edit (pending/confirmed). When **assigned**, only `{ days }` (the caregiver must be free on every day, else 409) |
| GET | `/api/call-list?day=today\|tomorrow&date=&view=pending\|done\|all` | – | Daily call list + counts |
| POST | `/api/bookings/:id/confirm` | `{ note? }` | Customer confirmed |
| POST | `/api/bookings/:id/ignore` | `{ note? }` | Customer declined / cancelled |
| GET | `/api/bookings/:id/pdf` | – | Booking confirmation PDF (`?inline=1` to open). Everyone who can view the booking |
| POST | `/api/bookings/:id/whatsapp` | – | Director + call center. New 7-day booking link + `{ number, message, waUrl, link, summary }`. 409 for a cancelled booking or a customer with no WhatsApp number |
| GET / DELETE | `/api/bookings/:id/links` | – | Link summary / disable every booking link |
| GET | `/api/bookings/:id/available-employees` | – | Employees free on **every day** of the booking (`{ date, days, endDate, employees }`) |
| GET | `/api/employees/available?date=&branchId=` | – | Same, for any date |
| POST | `/api/bookings/:id/assign` | `{ employeeId, note? }` | Assign or reassign |
| POST | `/api/bookings/:id/unassign` | `{ note? }` | Back to confirmed |
| POST | `/api/bookings/:id/deliver` | `{ note? }` | Done + invoice created (on or after the **last** day). Invoice: qty = days, amount = price × days |
| GET | `/api/invoices?status=generated\|printed&from=&to=&branchId=&customerId=&q=` | – | Invoice list |
| GET | `/api/invoices/:id` | – | Everything to print |
| POST | `/api/invoices/:id/print` | – | Count a print |
| POST | `/api/invoices/:id/mark-printed` | `{ note? }` | Close the booking |

### Lists & reports
| Method | URL |
|---|---|
| GET | `/api/bookings?date=&from=&to=&status=pending,confirmed&customerId=&employeeId=&branchId=&q=&page=&pageSize=` |
| GET | `/api/bookings/:id` — details, status history, invoice |
| GET | `/api/bookings/:id/journey` — the whole flow: milestones, every event, durations (see **Booking journey** below; `:id` may also be the booking number) |
| GET | `/api/dashboard?date=` — counts by status, invoices waiting to print |
| GET | `/api/reports/activity?from=&to=&event=&branchId=&page=&pageSize=` — everything that happened in a period (see **Reports** below) |
| GET | `/api/reports/activity/csv?from=&to=&event=&branchId=` — the same events as a CSV file |

### Master data
| Method | URL | Body |
|---|---|---|
| GET / POST | `/api/branches` | `{ code, name, address?, phone?, managerUserId? }` |
| GET / PATCH | `/api/branches/:id` | same fields + `isActive` |
| GET / POST | `/api/users` | `{ name, email, password, role, branchId? }` |
| GET / PATCH | `/api/users/:id` | `{ name?, email?, password?, role?, branchId?, isActive? }` |
| GET / POST | `/api/hospitals?type=&search=&active=` | `{ name, type: "private"\|"government", address?, city?, phone? }` |
| GET / PATCH | `/api/hospitals/:id` | same fields + `isActive` |
| GET / POST | `/api/employees?branchId=&status=&designation=&search=` | `{ branchId, firstName, middleName?, lastName, gender, phone, designation?: "Caregiver"\|"Nurse"\|"Branch Manager"\|"Call Center"\|"Manager", nic?, dob?, altPhone?, email?, address?, qualifications?, joinDate?, fileNo?, gnDivision?, district?, nearestPolice?, nearestPostOffice?, guardianName?, guardianRelationship?, guardianAddress?, guardianPhone?, docGnCertificate?, docNicCopy?, docPoliceCertificate?, docCharacterCertificate?, docBirthCertificate?, heardFrom?: "poster"\|"leaflet"\|"newspaper"\|"facebook"\|"messenger"\|"office"\|"employee", referredBy? (only kept when heardFrom = employee), rulesAgreed?: boolean, photo?: "data:image/jpeg;base64,…" (≤ 600 KB) }`. `fileNo` = employee number on the paper form (unique, 409 if used); `empNo` (EMP-0001) is still made by the system. Search also matches `fileNo` |
| GET / PATCH | `/api/employees/:id` | same fields + `status: "active"\|"inactive"`. PATCH: `photo: null` removes the photo, `rulesAgreed: false` clears the agreement, `""`/`null` clears a text field. GET also returns `referrerName`, `rulesAgreedAt`, `rulesAgreedByName`, `photoAt` |
| GET | `/api/employees/:id/photo` | The employee's photo (image/jpeg or image/png); 404 if none |
| GET / POST | `/api/employees/:id/leaves` | `{ fromDate, toDate, reason? }` |
| DELETE | `/api/leaves/:id` | – |
| GET / PATCH | `/api/patients/:id` | patient fields |
| PATCH | `/api/customers/:id` | customer fields |
| GET / PATCH | `/api/settings` | `{ company_name?, company_address?, company_phone? }` |

## Example: one booking end to end

```http
POST /api/auth/login            {"email":"admin@company.lk","password":"Admin@1234"}
POST /api/customers             {"firstName":"Ruwan","lastName":"Jayasinghe","phone":"0771234567","address":"12 Temple Rd",
                                 "patients":[{"firstName":"Lalitha","lastName":"Jayasinghe","gender":"female","relationship":"parent"}]}
POST /api/bookings              {"customerId":1,"patientId":1,"serviceDate":"2026-11-20","locationType":"home"}
GET  /api/call-list?day=today
POST /api/bookings/1/confirm    {"note":"Confirmed by phone"}
GET  /api/bookings/1/available-employees
POST /api/bookings/1/assign     {"employeeId":3}
POST /api/bookings/1/deliver    {}                       → data.invoiceId
GET  /api/invoices/1
POST /api/invoices/1/mark-printed {}
```

## Automated test

`scripts/test-api.mjs` runs 150+ checks over the whole flow (roles, conflicts, double booking).
Run it only against an **empty test database** with one admin (`admin@test.lk` / `Admin@1234`):

```bash
npm run dev                 # terminal 1
npm run test:api            # terminal 2
```

### Patient relationship
`relationship` is one of `self`, `parent`, `spouse`, `child`, `sibling`, `other`.
With `other`, `relationshipOther` (the real relationship, e.g. `"Grandmother"`) is required; with any other value it is cleared.

### Hospital bookings
With `locationType: "hospital"`: `hospitalId` and `wardNo` are required, `bedNo` is optional
(letters, numbers, spaces and `. / # -`, e.g. `"12A"`, `"ICU"`). Home bookings clear both.

### Packages (Director)
| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/api/packages?active=true` | | Everyone who can book |
| POST | `/api/packages` | `{ name, durationHours (1–24), price, description?, isDefault? }` | Director |
| GET / PATCH | `/api/packages/:id` | any of `name, durationHours, price, description, isDefault, isActive` | Director |

A booking copies the package's name, hours and price (`packageName`, `durationHours`, `rate`), so editing a
package never changes existing bookings or invoices. Leave `packageId` out to use the default package.
Exactly one package is the default; it can't be made inactive.

### Reports (activity)
Permission `viewReports`: Director and call center see everything; **branch managers see only bookings assigned
to their branch** (same rule as `/api/bookings`, so not-yet-assigned and released bookings are hidden from them).

Every row of `booking_status_logs` is one **event**, classified by `from_status → to_status`
(the mapping lives in `src/features/reports/events.ts`):

| from → to | `event` | Label |
|---|---|---|
| `null → pending` | `created` | New booking |
| `pending → confirmed` | `confirmed` | Confirmed |
| any `→ ignored` | `ignored` | Ignored (`note` = reason) |
| `confirmed → assigned` | `assigned` | Assigned |
| `assigned → assigned` | `reassigned` | Reassigned |
| `assigned → confirmed` | `unassigned` | Unassigned |
| `assigned → delivered` | `delivered` | Delivered (invoice created) |
| `delivered → invoice_printed` | `invoice_printed` | Invoice printed |

**Query** (all optional)

| Param | Meaning |
|---|---|
| `from`, `to` | `YYYY-MM-DD`, default today. `from` ≤ `to`, at most 366 days, not in the future (→ 400). Only `from` → up to today; only `to` → that one day. |
| `event` | one of the keys above: bookings whose **last step** in the period is that event. `assigned` also matches `reassigned` (like the Assigned card). |
| `branchId` | Director only; ignored for other roles. |
| `page`, `pageSize` | default 1 / 50, max 100 (JSON only; the CSV has every event). |

**GET `/api/reports/activity`** returns

```json
{
  "period":  { "from": "2026-11-24", "to": "2026-11-24", "days": 1, "label": "24 Nov 2026" },
  "filters": { "event": null, "branchId": null },
  "counts":  { "created": 0, "confirmed": 0, "ignored": 1, "assigned": 1, "reassigned": 0, "unassigned": 0, "delivered": 1, "invoice_printed": 1 },
  "money":   { "delivered": { "value": "9000.00", "count": 2 }, "invoicesPrinted": { "value": "4500.00", "count": 1 } },
  "byBranch":  [{ "branchId": 1, "branchName": "Kadawatha", "sessions": 2, "value": "9000.00" }],
  "byPackage": [{ "packageName": "Standard 24 hours", "durationHours": 24, "sessions": 2, "value": "9000.00" }],
  "events": [{ "id": 19, "at": "…", "event": "invoice_printed", "bookingId": 1, "bookingNo": "BK-2026-00001",
               "status": "invoice_printed", "customerName": "…", "customerPhone": "…", "patientName": "…",
               "serviceDate": "2026-11-24", "startTime": "07:30:00", "packageName": "Standard 24 hours", "durationHours": 24,
               "rate": "4500.00", "branchName": "Kadawatha", "employeeName": "…", "doneBy": "Call Agent", "note": null,
               "invoiceNo": "INV-2026-00001",
               "steps": ["created", "confirmed", "assigned", "delivered", "invoice_printed"], "…": "…" }],
  "total": 4, "page": 1, "pageSize": 50
}
```

- **One row per booking** touched in the period: its **last** event there (the step it reached), with `steps` =
  all of that booking's events in the period, oldest first. `total` = number of bookings.
- `counts` count each booking **once**, under that last step (a booking created, confirmed and assigned today
  counts only as `assigned`).
- `money`, `byBranch`, `byPackage` count **every** delivery / invoice printed in the period (a booking delivered
  and then printed the same day is still in Delivered value).
- `counts`, `money`, `byBranch`, `byPackage` cover the whole period (they ignore `event` and paging).
- **Delivered value** = sum of `bookings.rate` for bookings delivered in the period; **invoices printed value** = sum of
  `invoices.amount` for invoices marked printed in the period. Breakdowns are of delivered sessions, highest value first.
- `status` on each row is the booking's **current** status. Rows are newest first (by their last event).

**GET `/api/reports/activity/csv`**: `text/csv; charset=utf-8` with a UTF-8 BOM (Excel shows Sinhala/Tamil names),
`Content-Disposition: attachment; filename="activity_<from>_to_<to>.csv"`. Columns: Date, Time, Event, Booking no,
Customer, Customer phone, Patient, Service date, Start time, Package, Hours, Rate, Branch, Employee, Current status,
Done by, Note, Steps in period. One row per booking, like the JSON.

### Booking journey
**GET `/api/bookings/:id/journey`** (permission `viewReports`): the booking's whole flow in one response, used by the
Reports side panel and the booking page. `:id` is the numeric id **or** the booking number (`BK-2026-00018`).
Branch managers get **404** for bookings of another branch (same rule as `/api/bookings/:id`).

```json
{
  "booking":    { "id": 1, "bookingNo": "BK-2026-00001", "status": "invoice_printed", "serviceDate": "2026-11-24", "startTime": "07:30:00",
                  "durationHours": 24, "packageName": "Standard 24 hours", "rate": "4500.00", "locationType": "home",
                  "hospitalName": null, "wardNo": null, "bedNo": null, "serviceAddress": "…", "notes": null, "createdAt": "…" },
  "customer":   { "id": 1, "customerNo": "CUS-00001", "fullName": "…", "phone": "…" },
  "patient":    { "id": 1, "patientNo": "…", "fullName": "…", "gender": "female", "relationship": "parent", "relationshipOther": null },
  "assignment": { "employeeName": "Nimali Perera", "empNo": "EMP-0001", "designation": "Caregiver", "branchName": "Kadawatha" },
  "invoice":    { "id": 1, "invoiceNo": "INV-2026-00001", "amount": "4500.00", "status": "printed", "printCount": 1, "printedAt": "…" },
  "milestones": [{ "key": "booked", "label": "Booked", "state": "done", "at": "…", "byUser": "Call Agent", "sincePrevious": null },
                 { "key": "confirmed", "label": "Confirmed", "state": "done", "at": "…", "byUser": "Call Agent", "sincePrevious": 12 }, "…"],
  "ignored":    null,
  "events":     [{ "id": 7, "kind": "reassigned", "label": "Reassigned", "at": "…", "byUser": "Call Agent", "note": "…",
                   "employee": { "name": "Sunil Fernando", "empNo": "EMP-0003", "branchName": "Gampaha" },
                   "previousEmployee": { "name": "Nimali Perera", "empNo": "EMP-0001", "branchName": "Kadawatha" } }, "…"],
  "stats":      { "toConfirm": 12, "toAssign": 40, "toDeliver": 300, "bookingToDelivery": 352 }
}
```

- `milestones`: always the 5 steps `booked, confirmed, assigned, delivered, invoice_printed`, in order. `state` is
  `done`, `current` (the next step still to happen), `upcoming` or `skipped` (after an ignore). `at` / `byUser` come from the
  **first** log that reached the step; `assigned` is the start of the assignment still in effect (a reassignment keeps it, an
  unassign clears it until the next assign). `sincePrevious` = minutes since the previous done step.
- `ignored`: `{ at, byUser, note }` when the booking is ignored (`note` = the reason), else `null`.
- `events`: every status log, oldest first. `kind` / `label` use the same mapping as Reports (table above).
  `employee` = who was assigned (assigned / reassigned) or removed (unassigned); `null` = not recorded (logs from before
  migration 009). Reassignments also have `previousEmployee`.
- `stats`: minutes booked→confirmed, confirmed→assigned, assigned→delivered, booked→delivered; `null` until reached.
- Dates are ISO 8601 (UTC); the screens show them in Sri Lanka time.

### Booking page URLs
The booking screen is **`/bookings/BK-2026-00018`** (the booking number). Old links like `/bookings/12` redirect there,
keeping the query string. `?from=reports&back=/reports?...` shows "← Back to Reports" (only `/reports…` targets are accepted).
The REST API keeps numeric ids: `/api/bookings/:id`.

### Employee report
| Method | Path | Notes |
|---|---|---|
| GET | `/api/reports/employees?from=&to=&branchId=&page=&pageSize=` | Employees ranked by finished sessions (status `invoice_printed`) whose **service date** is in the period. Tie → latest `lastWorked`. Defaults to this month. Returns `items[{rank, empNo, fullName, sessions, daysWorked, hours, value, lastWorked}]`, `totals`, `chart{unit: day|week, bars[{from,to,count}]}` |
| GET | `/api/reports/employees/:empNo?from=&to=&branchId=` | One employee: `employee`, `totals`, `chart`, `sessions[]` (booking, customer, patient, package, location, rate, invoice). 404 for unknown employee |

Same access rules as the activity report: Director / call center see all branches (Director may pass `branchId`), branch managers only their own branch.

### Excel export (+ Google Drive)
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/exports` | `{ report: "activity"\|"employees"\|"employee", destination: "download"\|"drive"\|"both", filters: { from, to, branchId?, event? }, empNo? }` | Returns `{ fileName, rows, file (base64 .xlsx, unless drive only), drive: { link } \| null, driveError }`. Drive: every role (branch managers export their own branch), 400 when Drive isn't connected. Every export is logged in `export_logs`. |
| GET | `/api/google/connect` | | Director, browser only: starts the Google sign-in ("Connect Google Drive"). |
| GET | `/api/google/callback` | | Google returns here; saves the encrypted key and goes back to Settings. |

Set-up: `docs/GOOGLE_DRIVE_SETUP.md`.

### Invoice PDF + WhatsApp
| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/api/invoices/:id/pdf` | | The invoice as a PDF (`?inline=1` opens it). |
| POST | `/api/invoices/:id/whatsapp` | | Invoice must be marked printed (409 otherwise, or when the customer has no WhatsApp number). Makes a new 7-day link; returns `{ number, message, waUrl, link: { url, expiresAt } \| null, summary }`. `link` is null until Settings → `public_base_url` is set. Director + call center. |
| GET | `/api/invoices/:id/links` | | `{ sent, active, activeUntil, views, lastViewed }` |
| DELETE | `/api/invoices/:id/links` | | Disable every link of this invoice. |
| GET | `/i/:secret` | | **No login.** The customer's page: invoice summary + Download / View PDF. Expired or disabled → "no longer valid" page. Not indexed, not cached. |
| GET | `/i/:secret/pdf` | | **No login.** The PDF (`?download=1` saves it). 410 when the link doesn't work. |
| GET | `/b/:secret` | | **No login.** Booking confirmation page from the booking WhatsApp message: status, details, estimated amount + Download / View PDF. |
| GET | `/b/:secret/pdf` | | **No login.** The booking confirmation PDF. 410 when the link doesn't work. |

WhatsApp number used: main phone if its tick is on, else the other phone if ticked, else `whatsappPhone`. `PATCH /api/settings { "public_base_url": "https://care.example.lk" }` sets the address used in links (`""` clears it).

### Bookings for several days
A booking can run **1-30 days in a row** (`days`) from `serviceDate`, with the same caregiver every day. MySQL works out `endDate` (the last day).
- Assigning checks leave and other bookings on **every** day; the caregiver row is locked so two people can't book the same caregiver at once.
- `days` can still be changed after assignment (until delivered).
- `GET /api/bookings?date=` matches bookings running that day; `from`/`to` match any overlap.
- Employee report: each day is one session; only the days inside the period count (hours and value too).
