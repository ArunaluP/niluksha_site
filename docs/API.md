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
- The booking's **branch** = the assigned employee's branch. Branch managers see only their branch.

## Roles

"admin" in the database is shown as **Director** in the app.

| Permission | Director | Call center | Branch manager |
|---|:-:|:-:|:-:|
| Users, branches, hospitals, settings, employees + leave (write) | ✔ | | |
| View branches / hospitals / employees / settings | ✔ | ✔ | ✔ own branch |
| Customers + patients | ✔ | ✔ | |
| Create / edit bookings, call list, confirm, ignore | ✔ | ✔ | |
| Assign / reassign / unassign, available employees | ✔ | ✔ | |
| Deliver, print invoices, mark printed | ✔ | ✔ | |
| View bookings, invoices, dashboard | ✔ all | ✔ all | ✔ own branch (view only) |

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
| POST | `/api/customers` | `{ fullName, phone, nic?, altPhone?, address?, city?, notes?, patients?: [{ fullName, gender, relationship?, dob?, address?, careNotes? }] }` | New customer |
| GET | `/api/customers/:id` | – | Profile + patients + recent bookings |
| POST | `/api/customers/:id/patients` | `{ fullName, gender, relationship?, dob?, address?, careNotes? }` | Add patient |
| POST | `/api/bookings` | `{ customerId, patientId, serviceDate, startTime?, locationType: "home"\|"hospital", hospitalId?, wardRoom?, serviceAddress?, notes? }` | Record booking |
| PATCH | `/api/bookings/:id` | any of `patientId, serviceDate, startTime, locationType, hospitalId, wardRoom, serviceAddress, notes` | Edit (pending/confirmed) |
| GET | `/api/call-list?day=today\|tomorrow&date=&view=pending\|done\|all` | – | Daily call list + counts |
| POST | `/api/bookings/:id/confirm` | `{ note? }` | Customer confirmed |
| POST | `/api/bookings/:id/ignore` | `{ note? }` | Customer declined / cancelled |
| GET | `/api/bookings/:id/available-employees` | – | Free employees on that date |
| GET | `/api/employees/available?date=&branchId=` | – | Same, for any date |
| POST | `/api/bookings/:id/assign` | `{ employeeId, note? }` | Assign or reassign |
| POST | `/api/bookings/:id/unassign` | `{ note? }` | Back to confirmed |
| POST | `/api/bookings/:id/deliver` | `{ note? }` | Done + invoice created |
| GET | `/api/invoices?status=generated\|printed&from=&to=&branchId=&customerId=&q=` | – | Invoice list |
| GET | `/api/invoices/:id` | – | Everything to print |
| POST | `/api/invoices/:id/print` | – | Count a print |
| POST | `/api/invoices/:id/mark-printed` | `{ note? }` | Close the booking |

### Lists & reports
| Method | URL |
|---|---|
| GET | `/api/bookings?date=&from=&to=&status=pending,confirmed&customerId=&employeeId=&branchId=&q=&page=&pageSize=` |
| GET | `/api/bookings/:id` — details, status history, invoice |
| GET | `/api/dashboard?date=` — counts by status, invoices waiting to print |

### Master data
| Method | URL | Body |
|---|---|---|
| GET / POST | `/api/branches` | `{ code, name, address?, phone?, managerUserId? }` |
| GET / PATCH | `/api/branches/:id` | same fields + `isActive` |
| GET / POST | `/api/users` | `{ name, email, password, role, branchId? }` |
| GET / PATCH | `/api/users/:id` | `{ name?, email?, password?, role?, branchId?, isActive? }` |
| GET / POST | `/api/hospitals?type=&search=&active=` | `{ name, type: "private"\|"government", address?, city?, phone? }` |
| GET / PATCH | `/api/hospitals/:id` | same fields + `isActive` |
| GET / POST | `/api/employees?branchId=&status=&designation=&search=` | `{ branchId, fullName, gender, phone, designation?: "Caregiver"\|"Nurse"\|"Branch Manager"\|"Call Center"\|"Manager", nic?, dob?, altPhone?, address?, qualifications?, joinDate? }` |
| GET / PATCH | `/api/employees/:id` | same fields + `status: "active"\|"inactive"` |
| GET / POST | `/api/employees/:id/leaves` | `{ fromDate, toDate, reason? }` |
| DELETE | `/api/leaves/:id` | – |
| GET / PATCH | `/api/patients/:id` | patient fields |
| PATCH | `/api/customers/:id` | customer fields |
| GET / PATCH | `/api/settings` | `{ session_rate?, company_name?, company_address?, company_phone? }` |

## Example: one booking end to end

```http
POST /api/auth/login            {"email":"admin@company.lk","password":"Admin@1234"}
POST /api/customers             {"fullName":"Ruwan Jayasinghe","phone":"0771234567","address":"12 Temple Rd",
                                 "patients":[{"fullName":"Mrs. Jayasinghe","gender":"female","relationship":"parent"}]}
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
