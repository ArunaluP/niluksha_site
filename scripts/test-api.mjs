/**
 * End-to-end API test: runs the whole booking flow against a running server.
 *
 *   1. Use an EMPTY test database (fresh care_booking_schema.sql) + one admin:
 *        npm run create-user -- --email admin@test.lk --name "System Admin" --password "Admin@1234"
 *   2. Start the app:  npm run dev
 *   3. In another terminal:  node scripts/test-api.mjs   (or BASE_URL=http://localhost:3000 node ...)
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const ADMIN = { email: process.env.ADMIN_EMAIL ?? "admin@test.lk", password: process.env.ADMIN_PASSWORD ?? "Admin@1234" };

let passed = 0;
let failed = 0;
const tz = "Asia/Colombo";
const fmt = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const TODAY = fmt(new Date());
const plus = (days) => {
  const [y, m, d] = TODAY.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
const TOMORROW = plus(1);
const YESTERDAY = plus(-1);

function client(name) {
  let cookie = "";
  async function call(method, path, body, rawBody) {
    const res = await fetch(BASE + path, {
      method,
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
      redirect: "manual",
    });
    const set = res.headers.get("set-cookie");
    if (set) {
      const m = set.match(/cb_session=([^;]*)/);
      cookie = m && m[1] ? `cb_session=${m[1]}` : "";
    }
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* not JSON */
    }
    return { status: res.status, body: json, data: json?.data };
  }
  return {
    name,
    get: (p) => call("GET", p),
    post: (p, b = {}) => call("POST", p, b),
    patch: (p, b) => call("PATCH", p, b),
    del: (p) => call("DELETE", p),
    raw: (method, p, text) => call(method, p, undefined, text),
    /** GET a non-JSON response (CSV): status, headers and the raw text. */
    text: async (p) => {
      const res = await fetch(BASE + p, { headers: cookie ? { Cookie: cookie } : {}, redirect: "manual" });
      // res.text() would drop a leading UTF-8 BOM; keep it so the CSV check can see it.
      return { status: res.status, headers: res.headers, text: new TextDecoder("utf-8", { ignoreBOM: true }).decode(await res.arrayBuffer()) };
    },
    login: (email, password) => call("POST", "/api/auth/login", { email, password }),
  };
}

function check(label, cond, extra) {
  if (cond) {
    passed++;
    console.log(`  ✔ ${label}`);
  } else {
    failed++;
    console.log(`  ✖ ${label}`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : "");
  }
}
const expect = (label, res, status) => {
  check(`${label} → ${status}`, res.status === status, res.body);
  return res.data;
};
const section = (t) => console.log(`\n▶ ${t}`);

async function main() {
  console.log(`Testing ${BASE}  (today ${TODAY})`);
  const anon = client("anon");
  const admin = client("admin");
  const call = client("call");
  const mgr = client("manager");

  section("Auth");
  expect("No login: GET /api/bookings", await anon.get("/api/bookings"), 401);
  expect("Wrong password", await admin.login(ADMIN.email, "wrong-pass"), 401);
  expect("Bad email format", await admin.login("not-an-email", "x"), 400);
  const me0 = expect("Admin login", await admin.login(ADMIN.email, ADMIN.password), 200);
  check("login returns role admin", me0?.role === "admin");
  const me = expect("GET /api/auth/me", await admin.get("/api/auth/me"), 200);
  check("admin has manageUsers permission", me?.permissions?.includes("manageUsers"));

  section("Branches");
  const kdw = expect("Create branch KDW", await admin.post("/api/branches", { code: "kdw", name: "Kadawatha", phone: "0112345678" }), 201);
  check("code saved upper-case", kdw?.code === "KDW");
  const gmp = expect("Create branch GMP", await admin.post("/api/branches", { code: "GMP", name: "Gampaha" }), 201);
  expect("Duplicate branch code", await admin.post("/api/branches", { code: "KDW", name: "Dup" }), 409);
  const v = await admin.post("/api/branches", { name: "" });
  expect("Missing fields", v, 400);
  check("fieldErrors returned", v.body?.fieldErrors?.code && v.body?.fieldErrors?.name, v.body);
  expect("List branches", await admin.get("/api/branches"), 200);

  section("Users");
  const callUser = expect(
    "Create call-center user",
    await admin.post("/api/users", { name: "Call Agent", email: "call@test.lk", password: "Call@1234", role: "call_center" }),
    201,
  );
  check("password hash not exposed", callUser && !("passwordHash" in callUser));
  expect(
    "Branch manager without branch",
    await admin.post("/api/users", { name: "M", email: "m0@test.lk", password: "Mgr@12345", role: "branch_manager" }),
    400,
  );
  const mgrUser = expect(
    "Create KDW branch manager",
    await admin.post("/api/users", { name: "KDW Manager", email: "mgr@test.lk", password: "Mgr@12345", role: "branch_manager", branchId: kdw.id }),
    201,
  );
  expect("Duplicate email", await admin.post("/api/users", { name: "X", email: "call@test.lk", password: "Call@1234", role: "call_center" }), 409);
  const b1 = expect("Set KDW manager", await admin.patch(`/api/branches/${kdw.id}`, { managerUserId: mgrUser.id }), 200);
  check("branch shows manager name", b1?.managerName === "KDW Manager");
  expect("Admin can't disable self", await admin.patch(`/api/users/${me.id}`, { isActive: false }), 400);

  section("Hospitals");
  const hosp = expect("Create private hospital", await admin.post("/api/hospitals", { name: "Asiri Central", type: "private", city: "Colombo" }), 201);
  expect("Create government hospital", await admin.post("/api/hospitals", { name: "Gampaha General", type: "government", city: "Gampaha" }), 201);
  expect("Invalid hospital type", await admin.post("/api/hospitals", { name: "X", type: "clinic" }), 400);
  const hl = expect("Filter hospitals by type", await admin.get("/api/hospitals?type=government"), 200);
  check("filter returns 1 government hospital", hl?.length === 1);

  section("Employees + leave");
  const e1 = expect("Create employee 1 (KDW)", await admin.post("/api/employees", { branchId: kdw.id, firstName: "Nimali", lastName: "Perera", gender: "female", phone: "0711111111", nic: "199062345678" }), 201);
  check("employee DOB filled from NIC", e1?.dob === "1990-05-02", e1?.dob);
  check("employee number generated", /^EMP-\d{4}$/.test(e1?.empNo ?? ""), e1?.empNo);
  const e2 = expect("Create employee 2 (KDW)", await admin.post("/api/employees", { branchId: kdw.id, firstName: "Kumari", lastName: "Silva", gender: "female", phone: "0722222222" }), 201);
  const e3 = expect("Create employee 3 (GMP)", await admin.post("/api/employees", { branchId: gmp.id, firstName: "Sunil", lastName: "Fernando", gender: "male", phone: "0753333333" }), 201);
  const office = expect("Create office staff (Call Center type, GMP)", await admin.post("/api/employees", { branchId: gmp.id, firstName: "Office", lastName: "Staff", gender: "female", phone: "0744444444", designation: "Call Center" }), 201);
  expect("Invalid employee type", await admin.post("/api/employees", { branchId: kdw.id, firstName: "X", lastName: "Test", gender: "male", phone: "0711111113", designation: "Driver" }), 400);
  expect("Invalid NIC", await admin.post("/api/employees", { branchId: kdw.id, firstName: "X", lastName: "Test", gender: "male", phone: "0711111112", nic: "123" }), 400);
  expect("Duplicate NIC", await admin.post("/api/employees", { branchId: kdw.id, firstName: "X", lastName: "Test", gender: "female", phone: "0711111112", nic: "199062345678" }), 409);
  expect("Gender must match NIC", await admin.post("/api/employees", { branchId: kdw.id, firstName: "X", lastName: "Test", gender: "male", phone: "0711111114", nic: "198570300014" }), 400);
  expect("DOB must match NIC (update)", await admin.patch(`/api/employees/${e1.id}`, { dob: "1990-05-03" }), 400);
  expect("Leave: to before from", await admin.post(`/api/employees/${e3.id}/leaves`, { fromDate: TOMORROW, toDate: TODAY }), 400);
  const leave = expect("Add leave for employee 3 tomorrow", await admin.post(`/api/employees/${e3.id}/leaves`, { fromDate: TOMORROW, toDate: TOMORROW, reason: "Personal" }), 201);
  const ed = expect("Employee detail with leaves", await admin.get(`/api/employees/${e3.id}`), 200);
  check("detail lists 1 leave", ed?.leaves?.length === 1);
  const el = expect("List employees (search)", await admin.get("/api/employees?search=Nimali"), 200);
  check("search finds 1", el?.total === 1);

  section("Settings");
  const st = expect("Get settings", await admin.get("/api/settings"), 200);
  check("no session_rate setting any more (prices live in packages)", st && st.session_rate === undefined, st);
  expect("Unknown setting key rejected", await admin.patch("/api/settings", { invoice_prefix: "X" }), 400);
  const st2 = expect("Update company name", await admin.patch("/api/settings", { company_name: "Niluksha Care Services" }), 200);
  check("company name saved", st2?.company_name === "Niluksha Care Services");

  section("Packages");
  const pk = expect("List packages", await admin.get("/api/packages"), 200);
  const std = pk?.find?.((p) => p.isDefault);
  check("default package is Standard 24 hours / 4500.00", std?.name === "Standard 24 hours" && std?.price === "4500.00" && std?.durationHours === 24, std);
  const night = expect("Create 12-hour package", await admin.post("/api/packages", { name: "Night 12 hours", durationHours: 12, price: 2500 }), 201);
  check("price stored 2500.00", night?.price === "2500.00", night?.price);
  expect("Package over 24 hours rejected", await admin.post("/api/packages", { name: "Two days", durationHours: 48, price: 9000 }), 400);
  expect("Duplicate package name", await admin.post("/api/packages", { name: "Night 12 hours", durationHours: 10, price: 2000 }), 409);
  expect("Default package can't be made inactive", await admin.patch(`/api/packages/${std.id}`, { isActive: false }), 400);
  const nightDef = expect("Make Night the default", await admin.patch(`/api/packages/${night.id}`, { isDefault: true }), 200);
  check("night is default", nightDef?.isDefault === true);
  const stdNow = expect("Get standard", await admin.get(`/api/packages/${std.id}`), 200);
  check("standard no longer default", stdNow?.isDefault === false);
  expect("Make Standard default again", await admin.patch(`/api/packages/${std.id}`, { isDefault: true }), 200);

  section("Call-center login + permissions");
  expect("Call center login", await call.login("call@test.lk", "Call@1234"), 200);
  expect("Call center can't create branch", await call.post("/api/branches", { code: "X1", name: "X" }), 403);
  expect("Call center can't list users", await call.get("/api/users"), 403);

  expect("Call center can see packages", await call.get("/api/packages?active=true"), 200);
  expect("Call center can't create packages", await call.post("/api/packages", { name: "X", durationHours: 5, price: 100 }), 403);

  section("Customers + patients");
  const cust = expect(
    "Create customer with 2 patients",
    await call.post("/api/customers", {
      firstName: "Ruwan", lastName: "Jayasinghe",
      phone: "0771234567",
      address: "12 Temple Rd, Kadawatha",
      patients: [
        { firstName: "Lalitha", lastName: "Jayasinghe", gender: "female", relationship: "parent" },
        { firstName: "Ruwan", lastName: "Jayasinghe", gender: "male", relationship: "self", address: "Flat 4, Kiribathgoda" },
      ],
    }),
    201,
  );
  check("customer number generated", /^CUS-\d{5}$/.test(cust?.customerNo ?? ""), cust?.customerNo);
  check("2 patients created", cust?.patients?.length === 2);
  const [pMother, pSelf] = [cust.patients.find((p) => p.relationship === "parent"), cust.patients.find((p) => p.relationship === "self")];
  const withNic = expect("Customer with NIC only", await call.post("/api/customers", { firstName: "Saman", lastName: "Kumara", phone: "0779999996", nic: "853400937V" }), 201);
  check("customer DOB filled from NIC", withNic?.dob === "1985-12-05", withNic?.dob);
  expect("Customer DOB must match NIC", await call.post("/api/customers", { firstName: "Saman", lastName: "Kumara", phone: "0779999995", nic: "853400937V", dob: "1985-12-06" }), 400);
  expect("Future DOB rejected", await call.post("/api/customers", { firstName: "Saman", lastName: "Kumara", phone: "0779999994", dob: "2999-01-01" }), 400);
  const newNic = expect("Changing the NIC updates the DOB", await call.patch(`/api/customers/${withNic.id}`, { nic: "199086512345" }), 200);
  check("DOB follows the new NIC", newNic?.dob === "1990-12-30", newNic?.dob);
  const withMail = expect("Customer with email", await call.post("/api/customers", { firstName: "Mail", lastName: "Person", phone: "0779999993", email: "  Mail.Person@Gmail.COM " }), 201);
  check("email stored trimmed + lower-case", withMail?.email === "mail.person@gmail.com", withMail?.email);
  for (const bad of ["abc", "a@b", "a@b.c", "a b@c.lk", "a..b@c.lk", "a@-b.lk", "@gmail.com"]) {
    expect(`Bad email "${bad}"`, await call.post("/api/customers", { firstName: "Mail", lastName: "Person", phone: "0779999992", email: bad }), 400);
  }
  expect("Employee bad email", await admin.patch(`/api/employees/${e1.id}`, { email: "nimali@" }), 400);
  const eMail = expect("Employee email", await admin.patch(`/api/employees/${e1.id}`, { email: "nimali@care.lk" }), 200);
  check("employee email saved", eMail?.email === "nimali@care.lk", eMail?.email);
  const eMail2 = expect("Clear employee email", await admin.patch(`/api/employees/${e1.id}`, { email: "" }), 200);
  check("employee email cleared", eMail2?.email === null, eMail2?.email);
  expect("Customer without last name → 400", await call.post("/api/customers", { firstName: "Only", phone: "0779999998" }), 400);
  const named = expect("Customer with middle name", await call.post("/api/customers", { firstName: "W.", middleName: "A. Nimal", lastName: "Fernando", phone: "0779999997" }), 201);
  check("full name built from the three parts", named?.fullName === "W. A. Nimal Fernando", named?.fullName);
  const cust2 = expect("Create second customer", await call.post("/api/customers", { firstName: "Other", lastName: "Person", phone: "0779999999" }), 201);
  const p2 = expect("Add patient to second customer", await call.post(`/api/customers/${cust2.id}/patients`, { firstName: "Other", lastName: "Patient", gender: "male" }), 201);
  expect("'Other' needs the real relationship", await call.post(`/api/customers/${cust2.id}/patients`, { firstName: "Gran", lastName: "Person", gender: "female", relationship: "other" }), 400);
  const pOther = expect("Patient with relationship 'other'", await call.post(`/api/customers/${cust2.id}/patients`, { firstName: "Gran", lastName: "Person", gender: "female", relationship: "other", relationshipOther: "Grandmother" }), 201);
  check("relationship text saved", pOther?.relationshipOther === "Grandmother", pOther?.relationshipOther);
  const pOther2 = expect("Change 'other' to parent", await call.patch(`/api/patients/${pOther.id}`, { relationship: "parent" }), 200);
  check("relationship text cleared", pOther2?.relationshipOther === null, pOther2?.relationshipOther);
  const search = expect("Search customer by phone", await call.get("/api/customers?q=0771234567"), 200);
  check("search finds the customer", search?.items?.[0]?.id === cust.id);

  section("Bookings — create");
  const bA = expect(
    "A: today, home (address falls back to customer)",
    await call.post("/api/bookings", { customerId: cust.id, patientId: pMother.id, serviceDate: TODAY, locationType: "home" }),
    201,
  );
  check("A number BK-YYYY-NNNNN", /^BK-\d{4}-\d{5}$/.test(bA?.bookingNo ?? ""), bA?.bookingNo);
  check("A uses the default package (4500.00, 24 h)", bA?.rate === "4500.00" && bA?.durationHours === 24 && bA?.packageName === "Standard 24 hours", bA);
  check("A address = customer address", bA?.serviceAddress === "12 Temple Rd, Kadawatha");
  check("A status pending", bA?.status === "pending");
  const bB = expect(
    "B: tomorrow, hospital",
    await call.post("/api/bookings", { customerId: cust.id, patientId: pSelf.id, serviceDate: TOMORROW, startTime: "19:00", locationType: "hospital", hospitalId: hosp.id, wardNo: "5", bedNo: "12" }),
    201,
  );
  check("B hospital name", bB?.hospitalName === "Asiri Central");
  const bC = expect("C: today, other customer", await call.post("/api/bookings", { customerId: cust2.id, patientId: p2.id, serviceDate: TODAY, locationType: "home", serviceAddress: "5 Lake Rd" }), 201);
  const bD = expect("D: today, for late-cancel test", await call.post("/api/bookings", { customerId: cust2.id, patientId: p2.id, serviceDate: TODAY, locationType: "home", serviceAddress: "5 Lake Rd" }), 201);
  expect("Past date rejected", await call.post("/api/bookings", { customerId: cust.id, patientId: pMother.id, serviceDate: YESTERDAY, locationType: "home" }), 400);
  expect("Hospital booking without hospital", await call.post("/api/bookings", { customerId: cust.id, patientId: pMother.id, serviceDate: TODAY, locationType: "hospital" }), 400);
  expect("Patient of another customer", await call.post("/api/bookings", { customerId: cust.id, patientId: p2.id, serviceDate: TODAY, locationType: "home" }), 400);
  expect("Home booking with no address anywhere", await call.post("/api/bookings", { customerId: cust2.id, patientId: p2.id, serviceDate: TODAY, locationType: "home" }), 400);
  const bPatch = expect("Edit pending booking time", await call.patch(`/api/bookings/${bA.id}`, { startTime: "07:30" }), 200);
  check("time updated", bPatch?.startTime === "07:30:00");
  const bPkg = expect("Switch A to the 12-hour package", await call.patch(`/api/bookings/${bA.id}`, { packageId: night.id }), 200);
  check("hours, price and name copied from package", bPkg?.durationHours === 12 && bPkg?.rate === "2500.00" && bPkg?.packageName === "Night 12 hours", bPkg);
  const bPkg2 = expect("Switch A back to Standard", await call.patch(`/api/bookings/${bA.id}`, { packageId: std.id }), 200);
  check("back to 24 h / 4500.00", bPkg2?.durationHours === 24 && bPkg2?.rate === "4500.00");
  await admin.patch(`/api/packages/${night.id}`, { isActive: false });
  expect("Inactive package can't be booked", await call.patch(`/api/bookings/${bA.id}`, { packageId: night.id }), 400);

  expect("Hospital booking needs a ward no", await call.post("/api/bookings", { customerId: cust.id, patientId: pSelf.id, serviceDate: TOMORROW, startTime: "20:00", locationType: "hospital", hospitalId: hosp.id }), 400);
  expect("Bad bed no", await call.post("/api/bookings", { customerId: cust.id, patientId: pSelf.id, serviceDate: TOMORROW, startTime: "20:00", locationType: "hospital", hospitalId: hosp.id, wardNo: "ICU", bedNo: "12!" }), 400);

  section("Call list");
  const cl = expect("Today's call list", await call.get("/api/call-list?day=today"), 200);
  check("today has 3 pending", cl?.items?.length === 3 && cl?.counts?.pending === 3, cl?.counts);
  check("call list includes customer phone", cl?.items?.[0]?.customerPhone);
  const clT = expect("Tomorrow's call list", await call.get("/api/call-list?day=tomorrow"), 200);
  check("tomorrow has 1", clT?.items?.length === 1);

  section("Confirm / ignore");
  expect("Confirm A", await call.post(`/api/bookings/${bA.id}/confirm`, { note: "Customer confirmed by phone" }), 200);
  expect("Confirm A again", await call.post(`/api/bookings/${bA.id}/confirm`), 409);
  expect("Confirm B", await call.post(`/api/bookings/${bB.id}/confirm`), 200);
  expect("Confirm C", await call.post(`/api/bookings/${bC.id}/confirm`), 200);
  expect("Confirm D", await call.post(`/api/bookings/${bD.id}/confirm`), 200);
  expect("Deliver before assign", await call.post(`/api/bookings/${bA.id}/deliver`), 409);
  const clDone = expect("Call list view=done", await call.get("/api/call-list?day=today&view=done"), 200);
  check("done list has 3 confirmed", clDone?.items?.length === 3);

  section("Availability + assign");
  const avA = expect("Available for A (today)", await call.get(`/api/bookings/${bA.id}/available-employees`), 200);
  check("3 caregivers free today (office staff excluded)", avA?.employees?.length === 3 && !avA.employees.some((e) => e.id === office.id), avA?.employees?.map((e) => e.fullName));
  const notCare = await call.post(`/api/bookings/${bA.id}/assign`, { employeeId: office.id });
  expect("Assign office staff to a patient", notCare, 400);
  check("explains only caregivers/nurses", notCare.body?.error?.includes("only Caregivers and Nurses"), notCare.body);
  const avB = expect("Available for B (tomorrow)", await call.get(`/api/bookings/${bB.id}/available-employees`), 200);
  check("employee on leave excluded tomorrow", avB?.employees?.length === 2 && !avB.employees.some((e) => e.id === e3.id));
  expect("Assign B to employee on leave", await call.post(`/api/bookings/${bB.id}/assign`, { employeeId: e3.id }), 409);
  const aA = expect("Assign A → employee 1", await call.post(`/api/bookings/${bA.id}/assign`, { employeeId: e1.id }), 200);
  check("A branch = employee's branch (KDW)", aA?.branchId === kdw.id && aA?.status === "assigned");
  const dbl = await call.post(`/api/bookings/${bC.id}/assign`, { employeeId: e1.id });
  expect("Double-book employee 1 today", dbl, 409);
  check("friendly double-booking message", dbl.body?.error === "This employee is already booked on that date.", dbl.body);
  const avA2 = expect("Available today after assigning", await call.get(`/api/bookings/${bC.id}/available-employees`), 200);
  check("employee 1 no longer listed", !avA2?.employees?.some((e) => e.id === e1.id));
  expect("Reassign A to same employee", await call.post(`/api/bookings/${bA.id}/assign`, { employeeId: e1.id }), 409);
  const rA = expect("Reassign A → employee 3 (GMP)", await call.post(`/api/bookings/${bA.id}/assign`, { employeeId: e3.id }), 200);
  check("branch follows employee (GMP)", rA?.branchId === gmp.id);
  expect("Unassign A", await call.post(`/api/bookings/${bA.id}/unassign`), 200);
  expect("Edit confirmed booking (allowed)", await call.patch(`/api/bookings/${bA.id}`, { notes: "Bring wheelchair" }), 200);
  expect("Assign A → employee 1 again", await call.post(`/api/bookings/${bA.id}/assign`, { employeeId: e1.id }), 200);
  expect("Edit assigned booking (blocked)", await call.patch(`/api/bookings/${bA.id}`, { notes: "x" }), 409);
  expect("Assign C → employee 2", await call.post(`/api/bookings/${bC.id}/assign`, { employeeId: e2.id }), 200);
  expect("Assign D → employee 3", await call.post(`/api/bookings/${bD.id}/assign`, { employeeId: e3.id }), 200);
  expect("Assign B → employee 2 (tomorrow)", await call.post(`/api/bookings/${bB.id}/assign`, { employeeId: e2.id }), 200);
  expect("Leave over an assigned day blocked", await admin.post(`/api/employees/${e2.id}/leaves`, { fromDate: TODAY, toDate: TOMORROW }), 409);

  section("Late cancellation (ignore after assign)");
  const iD = expect("Ignore D (was assigned)", await call.post(`/api/bookings/${bD.id}/ignore`, { note: "Customer cancelled" }), 200);
  check("D ignored, employee released", iD?.status === "ignored" && iD?.employeeId === null);
  expect("Ignore D again", await call.post(`/api/bookings/${bD.id}/ignore`), 409);
  expect("Delete leave record", await admin.del(`/api/leaves/${leave.id}`), 200);

  section("Deliver → automatic invoice");
  expect("Deliver B (tomorrow) too early", await call.post(`/api/bookings/${bB.id}/deliver`), 400);
  const dA = expect("Deliver A", await call.post(`/api/bookings/${bA.id}/deliver`), 200);
  check("A delivered + invoice created", dA?.booking?.status === "delivered" && dA?.invoiceId > 0, dA);
  expect("Deliver A again", await call.post(`/api/bookings/${bA.id}/deliver`), 409);
  const detail = expect("A detail with history", await call.get(`/api/bookings/${bA.id}`), 200);
  check(
    "history: pending→confirmed→assigned→assigned→confirmed→assigned→delivered",
    detail?.history?.map((h) => h.toStatus).join(",") === "pending,confirmed,assigned,assigned,confirmed,assigned,delivered",
    detail?.history?.map((h) => h.toStatus),
  );
  check("reassign note recorded", detail?.history?.some((h) => h.note?.startsWith("Reassigned from Nimali Perera")));
  check("invoice linked", detail?.invoice?.amount === "4500.00");

  section("Branch manager (KDW)");
  expect("Manager login", await mgr.login("mgr@test.lk", "Mgr@12345"), 200);
  const mb = expect("Manager bookings list", await mgr.get("/api/bookings"), 200);
  check("manager sees only KDW bookings (A, B, C)", mb?.total === 3 && mb.items.every((b) => b.branchId === kdw.id), mb?.items?.map((b) => b.bookingNo));
  expect("Manager can't create bookings", await mgr.post("/api/bookings", { customerId: cust.id, patientId: pMother.id, serviceDate: TODAY, locationType: "home" }), 403);
  expect("Manager can't use call list", await mgr.get("/api/call-list"), 403);
  const me2 = expect("Manager employees list", await mgr.get("/api/employees"), 200);
  check("manager sees only KDW employees", me2?.total === 2, me2?.total);
  expect("Manager can't add employees (view only)", await mgr.post("/api/employees", { branchId: kdw.id, firstName: "X", lastName: "Test", gender: "male", phone: "0711111119" }), 403);
  expect("Manager can't add leave (view only)", await mgr.post(`/api/employees/${e1.id}/leaves`, { fromDate: TOMORROW, toDate: TOMORROW }), 403);
  expect("Manager can't open GMP employee", await mgr.get(`/api/employees/${e3.id}`), 404);
  expect("Manager can't open ignored/unassigned booking D", await mgr.get(`/api/bookings/${bD.id}`), 404);
  expect("Manager can't deliver (view only)", await mgr.post(`/api/bookings/${bC.id}/deliver`), 403);
  expect("Call center delivers C", await call.post(`/api/bookings/${bC.id}/deliver`), 200);
  const mInv = expect("Manager can view own-branch invoices", await mgr.get("/api/invoices"), 200);
  check("manager sees 2 KDW invoices", mInv?.total === 2, mInv?.total);
  expect("Manager can't print invoices", await mgr.post(`/api/invoices/${mInv.items[0].id}/print`), 403);
  const md = expect("Manager dashboard", await mgr.get("/api/dashboard"), 200);
  check("manager dashboard counts own branch only", md?.bookingsByStatus?.delivered === 2 && md?.bookingsByStatus?.ignored === 0, md);

  section("Invoices");
  const inv = expect("Invoice list (generated)", await call.get("/api/invoices?status=generated"), 200);
  check("2 invoices waiting", inv?.total === 2);
  const invA = inv.items.find((i) => i.bookingId === bA.id);
  const full = expect("Invoice detail for printing", await call.get(`/api/invoices/${invA.id}`), 200);
  check("invoice has company + patient + employee", full?.company?.name === "Niluksha Care Services" && full?.patientName && full?.employeeName);
  check("invoice number INV-YYYY-NNNNN", /^INV-\d{4}-\d{5}$/.test(full?.invoiceNo ?? ""));
  const pr = expect("Record print", await call.post(`/api/invoices/${invA.id}/print`), 200);
  check("print_count = 1", pr?.printCount === 1);
  const mp = expect("Mark invoice printed", await call.post(`/api/invoices/${invA.id}/mark-printed`), 200);
  check("invoice printed", mp?.status === "printed" && mp?.printedByName === "Call Agent");
  expect("Mark printed again", await call.post(`/api/invoices/${invA.id}/mark-printed`), 409);
  const finalA = expect("Booking A after printing", await call.get(`/api/bookings/${bA.id}`), 200);
  check("A closed: invoice_printed", finalA?.status === "invoice_printed");

  section("Reports (activity)");
  // Everything above happened today. ONE row per booking = the last step it reached today
  // (failed attempts write nothing):
  //   A: new → confirmed → assigned → reassigned → unassigned → assigned → delivered → invoice printed
  //   B: new → confirmed → assigned        C: new → confirmed → assigned → delivered
  //   D: new → confirmed → assigned → ignored
  const rep = expect("Activity report (today)", await admin.get("/api/reports/activity"), 200);
  const want = { created: 0, confirmed: 0, assigned: 1, reassigned: 0, unassigned: 0, ignored: 1, delivered: 1, invoice_printed: 1 };
  check("period defaults to today", rep?.period?.from === TODAY && rep?.period?.to === TODAY, rep?.period);
  check("counts: each booking once, by its last step", Object.entries(want).every(([k, n]) => rep?.counts?.[k] === n), rep?.counts);
  check("one row per booking (4)", rep?.total === 4 && new Set(rep.events.map((e) => e.bookingId)).size === 4, rep?.total);
  const deliveredRates = Number(finalA.rate) + Number(bC.rate);
  check("delivered value = sum of delivered rates", Number(rep?.money?.delivered?.value) === deliveredRates && rep?.money?.delivered?.count === 2, rep?.money);
  check("invoices printed value = invoice A", Number(rep?.money?.invoicesPrinted?.value) === Number(full.amount) && rep?.money?.invoicesPrinted?.count === 1, rep?.money);
  check("by branch: 2 sessions at KDW", rep?.byBranch?.length === 1 && rep.byBranch[0].branchId === kdw.id && rep.byBranch[0].sessions === 2, rep?.byBranch);
  check("by package: Standard 24 hours", rep?.byPackage?.[0]?.packageName === "Standard 24 hours" && rep.byPackage[0].durationHours === 24, rep?.byPackage);
  const evA = rep?.events?.filter((e) => e.bookingId === bA.id) ?? [];
  check("A: one row, last step invoice printed, status invoice_printed", evA.length === 1 && evA[0].event === "invoice_printed" && evA[0].status === "invoice_printed", evA);
  check(
    "A's trail lists all 8 steps of today",
    evA[0]?.steps?.join(",") === "created,confirmed,assigned,reassigned,unassigned,assigned,delivered,invoice_printed",
    evA[0]?.steps,
  );
  check("ignore reason shown as note", rep?.events?.some((e) => e.bookingId === bD.id && e.event === "ignored" && e.note === "Customer cancelled"));
  const repDel = expect("event=delivered", await admin.get("/api/reports/activity?event=delivered"), 200);
  check("only bookings whose last step is delivered (C)", repDel?.total === 1 && repDel.events[0].bookingId === bC.id && repDel.events[0].event === "delivered", repDel?.events);
  const repAs = expect("event=assigned", await admin.get("/api/reports/activity?event=assigned"), 200);
  check("assigned filter: B only", repAs?.total === 1 && repAs.events[0].bookingId === bB.id, repAs?.events);
  const repPage = expect("Paging", await admin.get("/api/reports/activity?pageSize=3&page=2"), 200);
  check("page 2 of 3 has the 4th booking", repPage?.events?.length === 1 && repPage.total === 4);
  const repBr = expect("Director branch filter (GMP)", await admin.get(`/api/reports/activity?branchId=${gmp.id}`), 200);
  check("no GMP events (D was released, nothing is at GMP now)", repBr?.total === 0, repBr?.total);
  expect("from after to", await admin.get(`/api/reports/activity?from=${TODAY}&to=${YESTERDAY}`), 400);
  expect("Future date", await admin.get(`/api/reports/activity?from=${TODAY}&to=${TOMORROW}`), 400);
  expect("Range over 366 days", await admin.get(`/api/reports/activity?from=${plus(-400)}&to=${TODAY}`), 400);
  expect("Unknown event type", await admin.get("/api/reports/activity?event=deleted"), 400);
  expect("Call center can see reports", await call.get("/api/reports/activity"), 200);
  expect("No login: reports", await anon.get("/api/reports/activity"), 401);
  // KDW manager: A, B and C are assigned to KDW now; D (released) is hidden.
  const repM = expect("Manager report", await mgr.get(`/api/reports/activity?pageSize=100&branchId=${gmp.id}`), 200);
  check("manager sees only KDW bookings (branchId param ignored)", repM?.total === 3 && repM.events.every((e) => e.branchId === kdw.id), repM?.total);
  check("manager doesn't see D", !repM?.events?.some((e) => e.bookingId === bD.id));
  check(
    "manager counts own branch only",
    repM?.counts?.assigned === 1 && repM?.counts?.delivered === 1 && repM?.counts?.invoice_printed === 1 && repM?.counts?.ignored === 0,
    repM?.counts,
  );
  check("manager money: both KDW deliveries", Number(repM?.money?.delivered?.value) === deliveredRates, repM?.money);
  const csv = await admin.text("/api/reports/activity/csv");
  check("CSV → 200", csv.status === 200, csv.status);
  check("CSV content-type text/csv", csv.headers.get("content-type")?.startsWith("text/csv"), csv.headers.get("content-type"));
  check("CSV file name", csv.headers.get("content-disposition")?.includes(`activity_${TODAY}_to_${TODAY}.csv`), csv.headers.get("content-disposition"));
  const csvLines = csv.text.replace(/^﻿/, "").trim().split(/\r?\n/);
  check("CSV has UTF-8 BOM + header row", csv.text.startsWith("﻿Date,Time,Event,Booking no,Customer"), csv.text.slice(0, 60));
  check("CSV has one row per booking (4)", csvLines.length === 5, csvLines.length);
  check("CSV shows A's steps", csvLines.some((l) => l.includes("New → Confirmed → Assigned → Reassigned")));
  const csvM = await mgr.text("/api/reports/activity/csv");
  check("manager CSV has only own branch (3 rows)", csvM.status === 200 && csvM.text.trim().split(/\r?\n/).length === 4);
  expect("CSV bad dates → 400", await admin.get(`/api/reports/activity/csv?from=${TOMORROW}`), 400);

  section("Booking journey");
  // A (all today): created → confirmed → assigned (Nimali) → reassigned (Sunil) → unassigned
  //                → assigned (Nimali) → delivered → invoice printed  = 8 status changes
  const MS = "booked,confirmed,assigned,delivered,invoice_printed";
  const jA = expect("Journey of A", await admin.get(`/api/bookings/${bA.id}/journey`), 200);
  check("5 milestones in order", jA?.milestones?.map((m) => m.key).join(",") === MS, jA?.milestones?.map((m) => m.key));
  check("A: every milestone done", jA?.milestones?.every((m) => m.state === "done" && m.at && m.byUser), jA?.milestones);
  check("A: one event per status change (8)", jA?.events?.length === 8, jA?.events?.map((e) => e.kind));
  check(
    "A: event kinds in order",
    jA?.events?.map((e) => e.kind).join(",") === "created,confirmed,assigned,reassigned,unassigned,assigned,delivered,invoice_printed",
    jA?.events?.map((e) => e.kind),
  );
  check("A: stats.bookingToDelivery set", typeof jA?.stats?.bookingToDelivery === "number", jA?.stats);
  const asg = jA?.events?.find((e) => e.kind === "assigned");
  check("assigned event has the employee", asg?.employee?.name === "Nimali Perera" && asg.employee.empNo === e1.empNo && asg.employee.branchName === "Kadawatha", asg);
  const rea = jA?.events?.find((e) => e.kind === "reassigned");
  check("reassigned event: from Nimali → to Sunil", rea?.previousEmployee?.name === "Nimali Perera" && rea?.employee?.name === "Sunil Fernando", rea);
  check("unassigned event names who was removed", jA?.events?.find((e) => e.kind === "unassigned")?.employee?.name === "Sunil Fernando");
  check("A: invoice with print count", jA?.invoice?.invoiceNo === full.invoiceNo && jA.invoice.printCount === 1, jA?.invoice);
  check("A: assignment = Nimali", jA?.assignment?.employeeName === "Nimali Perera" && jA.assignment.branchName === "Kadawatha", jA?.assignment);
  const jByNo = expect("Journey by booking number", await admin.get(`/api/bookings/${bA.bookingNo}/journey`), 200);
  check("same booking", jByNo?.booking?.id === bA.id);
  const jB = expect("Journey of B (assigned)", await admin.get(`/api/bookings/${bB.id}/journey`), 200);
  check("B: delivered is current, invoice printed upcoming", jB?.milestones?.map((m) => m.state).join(",") === "done,done,done,current,upcoming", jB?.milestones?.map((m) => m.state));
  check("B: bookingToDelivery null (not delivered)", jB?.stats?.bookingToDelivery === null, jB?.stats);
  const jD = expect("Journey of D (ignored)", await admin.get(`/api/bookings/${bD.id}/journey`), 200);
  check("D: later milestones skipped", jD?.milestones?.map((m) => m.state).join(",") === "done,done,done,skipped,skipped", jD?.milestones?.map((m) => m.state));
  check("D: ignored stop with reason", jD?.ignored?.note === "Customer cancelled", jD?.ignored);
  // A booking at GMP (another branch for the KDW manager).
  const bG = expect("G: tomorrow, for another branch", await call.post("/api/bookings", { customerId: cust2.id, patientId: p2.id, serviceDate: TOMORROW, locationType: "home", serviceAddress: "5 Lake Rd" }), 201);
  await call.post(`/api/bookings/${bG.id}/confirm`);
  expect("Assign G → employee 3 (GMP)", await call.post(`/api/bookings/${bG.id}/assign`, { employeeId: e3.id }), 200);
  expect("Manager: own-branch journey (A)", await mgr.get(`/api/bookings/${bA.id}/journey`), 200);
  expect("Manager: other branch's journey (G)", await mgr.get(`/api/bookings/${bG.id}/journey`), 404);
  expect("Manager: other branch's journey by booking no", await mgr.get(`/api/bookings/${bG.bookingNo}/journey`), 404);
  expect("Journey: unknown booking", await admin.get("/api/bookings/BK-1999-99999/journey"), 404);
  expect("Journey: bad ref", await admin.get("/api/bookings/abc/journey"), 404);
  expect("No login: journey", await anon.get(`/api/bookings/${bA.id}/journey`), 401);
  // Booking page URLs: /bookings/<id> redirects to /bookings/BK-… (query string kept).
  const old = await admin.text(`/bookings/${bA.id}?from=reports&back=%2Freports`);
  const loc = old.headers.get("location") ?? "";
  check("old /bookings/:id link redirects to /bookings/BK-…", [307, 308].includes(old.status) && loc.includes(`/bookings/${bA.bookingNo}?from=reports&back=%2Freports`), { status: old.status, loc });
  const pageA = await admin.text(`/bookings/${bA.bookingNo}`);
  check("/bookings/BK-… → 200", pageA.status === 200, pageA.status);

  section("Admin dashboard + concurrency");
  const ad = expect("Admin dashboard", await admin.get("/api/dashboard"), 200);
  check("admin sees all 3 of today's bookings (A, C, D)", ad?.totalBookings === 3, ad?.bookingsByStatus);
  // Two people assign the same employee to two different bookings at the same moment.
  const bE = await call.post("/api/bookings", { customerId: cust2.id, patientId: p2.id, serviceDate: TOMORROW, locationType: "home", serviceAddress: "5 Lake Rd" });
  const bF = await call.post("/api/bookings", { customerId: cust2.id, patientId: p2.id, serviceDate: TOMORROW, locationType: "home", serviceAddress: "5 Lake Rd" });
  await call.post(`/api/bookings/${bE.data.id}/confirm`);
  await call.post(`/api/bookings/${bF.data.id}/confirm`);
  const [r1, r2] = await Promise.all([
    call.post(`/api/bookings/${bE.data.id}/assign`, { employeeId: e1.id }),
    admin.post(`/api/bookings/${bF.data.id}/assign`, { employeeId: e1.id }),
  ]);
  check("simultaneous assign: exactly one succeeds", [r1.status, r2.status].sort().join(",") === "200,409", [r1.status, r2.status]);

  section("Account control");
  expect("Disable call-center user", await admin.patch(`/api/users/${callUser.id}`, { isActive: false }), 200);
  expect("Disabled user's existing session rejected", await call.get("/api/bookings"), 401);
  expect("Disabled user can't log in", await call.login("call@test.lk", "Call@1234"), 403);
  expect("Logout", await mgr.post("/api/auth/logout"), 200);
  expect("After logout", await mgr.get("/api/bookings"), 401);
  expect("Unknown booking id", await admin.get("/api/bookings/999999"), 404);
  expect("Invalid id", await admin.get("/api/bookings/abc"), 404);
  const bad = await admin.raw("POST", "/api/hospitals", "{ not json");
  expect("Invalid JSON body", bad, 400);
  check("invalid JSON explained", bad.body?.fieldErrors?.body?.[0] === "Request body must be valid JSON.", bad.body);

  console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
