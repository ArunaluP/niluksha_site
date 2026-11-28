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

  section("Employee registration form (employee number, guardian, documents, rules, photo)");
  const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP////////////////////////////////////////////////////////////////////////////////////8AAAsIAAEAAQEBEQD/xAAUAAEAAAAAAAAAAAAAAAAAAAAI/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAAPwBH/9k=";
  const reg = {
    // office staff in Gampaha so the caregiver counts in later tests stay the same
    branchId: gmp.id, designation: "Call Center", firstName: "Dilani", lastName: "Wijesinghe", gender: "female", phone: "0711112233", fileNo: "sn/1045",
    gnDivision: "Kadawatha North", district: "Gampaha", nearestPolice: "Kadawatha", nearestPostOffice: "Kadawatha",
    guardianName: "Sunethra Wijesinghe", guardianRelationship: "Mother", guardianAddress: "12, Temple Road, Kadawatha", guardianPhone: "0771234567",
    docGnCertificate: true, docNicCopy: true, docPoliceCertificate: false, docCharacterCertificate: true, docBirthCertificate: true,
    heardFrom: "employee", referredBy: e1.id, rulesAgreed: true, photo: JPEG,
  };
  const reg1 = expect("Register employee with the full form", await admin.post("/api/employees", reg), 201);
  check("employee number saved (upper-case)", reg1?.fileNo === "SN/1045", reg1?.fileNo);
  check("system number still created", /^EMP-\d+$/.test(reg1?.empNo ?? ""), reg1?.empNo);
  check("guardian + area saved", reg1?.guardianName === "Sunethra Wijesinghe" && reg1?.district === "Gampaha" && reg1?.guardianPhone === "0771234567");
  check("documents saved", reg1?.docGnCertificate === true && reg1?.docPoliceCertificate === false);
  check("referred by employee 1", reg1?.referredBy === e1.id && reg1?.referrerName === "Nimali Perera", reg1);
  check("rules agreed recorded with time + login", Boolean(reg1?.rulesAgreedAt) && Boolean(reg1?.rulesAgreedByName), reg1);
  check("photo saved", Boolean(reg1?.photoAt));
  const ph = await admin.text(`/api/employees/${reg1?.id}/photo`);
  check("photo served as JPEG", ph.status === 200 && ph.headers.get("content-type") === "image/jpeg", ph.status);
  expect("Same employee number again", await admin.post("/api/employees", { ...reg, phone: "0711112234", photo: undefined }), 409);
  expect("Bad employee number characters", await admin.post("/api/employees", { ...reg, fileNo: "12#4", photo: undefined }), 400);
  expect("Unknown district", await admin.post("/api/employees", { ...reg, fileNo: "X1", district: "Atlantis", photo: undefined }), 400);
  expect("Photo that isn't a picture", await admin.post("/api/employees", { ...reg, fileNo: "X2", photo: "data:image/jpeg;base64,aGVsbG8gd29ybGQ=" }), 400);
  expect("Unknown 'heard from'", await admin.post("/api/employees", { ...reg, fileNo: "X3", heardFrom: "radio", photo: undefined }), 400);
  expect("Referrer can't be themselves", await admin.patch(`/api/employees/${reg1?.id}`, { referredBy: reg1?.id }), 400);
  const reg2 = expect("Heard from Facebook clears the referrer", await admin.patch(`/api/employees/${reg1?.id}`, { heardFrom: "facebook" }), 200);
  check("referrer cleared", reg2?.heardFrom === "facebook" && reg2?.referredBy === null, reg2);
  const reg3 = expect("Untick agreement, remove photo, clear guardian phone", await admin.patch(`/api/employees/${reg1?.id}`, { rulesAgreed: false, photo: null, guardianPhone: "" }), 200);
  check("agreement + photo + guardian phone cleared", reg3?.rulesAgreedAt === null && reg3?.photoAt === null && reg3?.guardianPhone === null, reg3);
  check("photo gone (404)", (await admin.text(`/api/employees/${reg1?.id}/photo`)).status === 404);
  const reg4 = expect("Search by employee number", await admin.get("/api/employees?search=SN/1045"), 200);
  check("search by employee number finds 1", reg4?.total === 1);

  section("Settings");
  const st = expect("Get settings", await admin.get("/api/settings"), 200);
  check("no session_rate setting any more (prices live in packages)", st && st.session_rate === undefined, st);
  expect("Unknown setting key rejected", await admin.patch("/api/settings", { invoice_prefix: "X" }), 400);
  const st2 = expect("Update company name", await admin.patch("/api/settings", { company_name: "Niluksha Care Services" }), 200);
  check("company name saved", st2?.company_name === "Niluksha Care Services");
  const st3 = expect("Save the Sinhala company name", await admin.patch("/api/settings", { company_name_si: "නිලුක්ෂ සත්කාර සේවා" }), 200);
  check("Sinhala name saved", st3?.company_name_si === "නිලුක්ෂ සත්කාර සේවා", st3?.company_name_si);

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
  check("WhatsApp ticks on by default, no separate number", cust?.phoneWhatsapp === true && cust?.altPhoneWhatsapp === true && cust?.whatsappPhone === null, cust);
  const waOnly = expect(
    "Customer whose phones aren't on WhatsApp, with a WhatsApp number",
    await call.post("/api/customers", { firstName: "Wa", lastName: "Only", phone: "0112345678", phoneWhatsapp: false, altPhoneWhatsapp: false, whatsappPhone: "+94 76 555 1234" }),
    201,
  );
  check("WhatsApp number stored as 07…", waOnly?.whatsappPhone === "0765551234" && waOnly?.phoneWhatsapp === false, waOnly);
  expect(
    "WhatsApp number must be a mobile",
    await call.post("/api/customers", { firstName: "Wa", lastName: "Land", phone: "0779999990", phoneWhatsapp: false, altPhoneWhatsapp: false, whatsappPhone: "0112223344" }),
    400,
  );
  const waTicked = expect(
    "Ticked phone wins over a separate WhatsApp number",
    await call.post("/api/customers", { firstName: "Wa", lastName: "Tick", phone: "0779999989", whatsappPhone: "0765551235" }),
    201,
  );
  check("separate number dropped", waTicked?.whatsappPhone === null, waTicked);
  const waBack = expect("Ticking the phone again clears the WhatsApp number", await call.patch(`/api/customers/${waOnly.id}`, { phoneWhatsapp: true }), 200);
  check("whatsappPhone cleared", waBack?.phoneWhatsapp === true && waBack?.whatsappPhone === null, waBack);
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
  check("friendly double-booking message", /already booked on BK-\d{4}-\d{5}/.test(dbl.body?.error ?? ""), dbl.body);
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
  check("manager sees KDW bookings (A, B, C) + booking D with no branch", mb?.total === 4 && mb.items.every((b) => b.branchId === kdw.id || b.branchId === null), mb?.items?.map((b) => b.bookingNo));
  expect("Manager can use the call list", await mgr.get("/api/call-list"), 200);
  const me2 = expect("Manager employees list", await mgr.get("/api/employees"), 200);
  check("manager sees only KDW employees", me2?.total === 2, me2?.total);
  expect("Manager can't add employees to another branch", await mgr.post("/api/employees", { branchId: gmp.id, firstName: "X", lastName: "Test", gender: "male", phone: "0711111119" }), 403);
  expect("Manager can't open GMP employee", await mgr.get(`/api/employees/${e3.id}`), 404);
  expect("Manager can't add leave for GMP employee", await mgr.post(`/api/employees/${e3.id}/leaves`, { fromDate: plus(20), toDate: plus(20) }), 404);
  expect("Manager can open booking D (no branch)", await mgr.get(`/api/bookings/${bD.id}`), 200);
  expect("Call center delivers C", await call.post(`/api/bookings/${bC.id}/deliver`), 200);
  const mInv = expect("Manager can view own-branch invoices", await mgr.get("/api/invoices"), 200);
  check("manager sees 2 KDW invoices", mInv?.total === 2, mInv?.total);
  const md = expect("Manager dashboard", await mgr.get("/api/dashboard"), 200);
  check("manager dashboard: own branch + bookings with no branch", md?.bookingsByStatus?.delivered === 2 && md?.bookingsByStatus?.ignored === 1, md);

  section("Invoices");
  const inv = expect("Invoice list (generated)", await call.get("/api/invoices?status=generated"), 200);
  check("2 invoices waiting", inv?.total === 2);
  const invA = inv.items.find((i) => i.bookingId === bA.id);
  const full = expect("Invoice detail for printing", await call.get(`/api/invoices/${invA.id}`), 200);
  check("invoice has company + patient + employee", full?.company?.name === "Niluksha Care Services" && full?.patientName && full?.employeeName);
  check("invoice number INV-YYYY-NNNNN", /^INV-\d{4}-\d{5}$/.test(full?.invoiceNo ?? ""));
  const pr = expect("Record print", await call.post(`/api/invoices/${invA.id}/print`), 200);
  check("print_count = 1", pr?.printCount === 1);
  expect("WhatsApp before the invoice is marked printed", await call.post(`/api/invoices/${invA.id}/whatsapp`), 409);
  const mp = expect("Mark invoice printed", await call.post(`/api/invoices/${invA.id}/mark-printed`), 200);
  check("invoice printed", mp?.status === "printed" && mp?.printedByName === "Call Agent");
  expect("Mark printed again", await call.post(`/api/invoices/${invA.id}/mark-printed`), 409);
  const finalA = expect("Booking A after printing", await call.get(`/api/bookings/${bA.id}`), 200);
  check("A closed: invoice_printed", finalA?.status === "invoice_printed");

  section("Invoice on WhatsApp (7-day link)");
  expect("Bad public web address rejected", await admin.patch("/api/settings", { public_base_url: "care.example" }), 400);
  expect("Set the public web address", await admin.patch("/api/settings", { public_base_url: `${BASE}/` }), 200);
  const wa = expect("Prepare WhatsApp message", await call.post(`/api/invoices/${invA.id}/whatsapp`), 200);
  check("opens WhatsApp with the customer's number", wa?.waUrl?.startsWith("https://wa.me/94771234567?text=") && wa?.number === "0771234567", wa?.waUrl);
  check("message has the details and the link", wa?.message?.includes(full.invoiceNo) && wa.message.includes("Rs. ") && wa.message.includes(full.patientName) && wa.message.includes(wa?.link?.url ?? "§"), wa?.message);
  const linkPath = new URL(wa.link.url).pathname;
  check("link = /i/<43-char secret>, valid 7 days", /^\/i\/[A-Za-z0-9_-]{43}$/.test(linkPath) && Math.abs(new Date(wa.link.expiresAt) - Date.now() - 7 * 864e5) < 60e3, wa?.link);
  const page = await anon.text(linkPath);
  check("customer opens the link without login", page.status === 200 && page.text.includes(full.invoiceNo) && page.text.includes("Download PDF"), page.status);
  check("link page is not indexed", page.headers.get("x-robots-tag")?.includes("noindex"), page.headers.get("x-robots-tag"));
  const pdf = await anon.text(`${linkPath}/pdf?download=1`);
  check("PDF download from the link", pdf.status === 200 && pdf.text.startsWith("%PDF") && pdf.headers.get("content-disposition")?.includes(`${full.invoiceNo}.pdf`), pdf.status);
  const staffPdf = await call.text(`/api/invoices/${invA.id}/pdf`);
  check("staff PDF button", staffPdf.status === 200 && staffPdf.text.startsWith("%PDF"), staffPdf.status);
  check("PDF needs login (staff route)", (await anon.text(`/api/invoices/${invA.id}/pdf`)).status === 401);
  const ls = expect("Link summary", await call.get(`/api/invoices/${invA.id}/links`), 200);
  check("1 working link, opened once", ls?.active === 1 && ls?.views === 1, ls);
  const fake = await anon.text(`/i/${"x".repeat(43)}`);
  check("made-up link shows 'no longer valid'", fake.status === 200 && fake.text.includes("no longer valid"), fake.status);
  check("made-up link: no PDF", (await anon.text(`/i/${"x".repeat(43)}/pdf`)).status === 410);
  const off = expect("Disable links", await call.del(`/api/invoices/${invA.id}/links`), 200);
  check("no working links", off?.active === 0, off);
  check("disabled link: no PDF", (await anon.text(`${linkPath}/pdf`)).status === 410);

  section("Booking confirmation on WhatsApp + print");
  const bw = expect("Prepare booking WhatsApp message", await call.post(`/api/bookings/${full.bookingId}/whatsapp`), 200);
  check("booking: opens WhatsApp with the customer's number", bw?.waUrl?.startsWith("https://wa.me/94771234567?text=") && bw?.number === "0771234567", bw?.waUrl);
  check("booking message: number, patient, estimate, link", bw?.message?.includes(full.bookingNo) && bw.message.includes(full.patientName) && bw.message.includes("Estimated amount") && bw.message.includes(bw?.link?.url ?? "§"), bw?.message);
  const bPath = new URL(bw.link.url).pathname;
  check("booking link = /b/<43-char secret>", /^\/b\/[A-Za-z0-9_-]{43}$/.test(bPath), bPath);
  const bPage = await anon.text(bPath);
  check("customer opens the booking link without login", bPage.status === 200 && bPage.text.includes(full.bookingNo) && bPage.text.includes("Estimated amount"), bPage.status);
  check("booking link page is not indexed", bPage.headers.get("x-robots-tag")?.includes("noindex"));
  const bPdf = await anon.text(`${bPath}/pdf?download=1`);
  check("booking PDF from the link", bPdf.status === 200 && bPdf.text.startsWith("%PDF") && bPdf.headers.get("content-disposition")?.includes(`${full.bookingNo}.pdf`), bPdf.status);
  const bStaffPdf = await mgr.text(`/api/bookings/${full.bookingId}/pdf`);
  check("staff booking PDF (manager can view)", bStaffPdf.status === 200 && bStaffPdf.text.startsWith("%PDF"), bStaffPdf.status);
  check("booking PDF needs login", (await anon.text(`/api/bookings/${full.bookingId}/pdf`)).status === 401);
  const bls = expect("Booking link summary", await call.get(`/api/bookings/${full.bookingId}/links`), 200);
  check("1 working booking link, opened once", bls?.active === 1 && bls?.views === 1, bls);
  check("invoice link secret doesn't open a booking", (await anon.text(`/b${linkPath.slice(2)}/pdf`)).status === 410);
  expect("Cancelled booking can't be sent", await call.post(`/api/bookings/${bD.id}/whatsapp`), 409);
  const bOff = expect("Disable booking links", await call.del(`/api/bookings/${full.bookingId}/links`), 200);
  check("booking links disabled", bOff?.active === 0 && (await anon.text(`${bPath}/pdf`)).status === 410, bOff);
  const printPage = await call.text(`/bookings/${full.bookingNo}/print`);
  check("print page shows the confirmation", printPage.status === 200 && printPage.text.includes("CONFIRMATION") && printPage.text.includes(full.bookingNo), printPage.status);
  expect("Clear the public web address", await admin.patch("/api/settings", { public_base_url: "" }), 200);
  const wa2 = expect("WhatsApp without a public address", await call.post(`/api/invoices/${invA.id}/whatsapp`), 200);
  check("message sent without a link", wa2?.link === null && !wa2?.message?.includes("http"), wa2?.message);

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

  section("Reports (employees)");
  // Only A reached invoice_printed (C is delivered but not printed → not finished).
  const er = expect("Employee report (this month)", await admin.get("/api/reports/employees"), 200);
  check("one employee with 1 finished session (A)", er?.total === 1 && er.items[0].sessions === 1 && er.totals.sessions === 1, er?.items);
  check("value = A's rate", Number(er?.totals?.value) === Number(finalA.rate), er?.totals);
  check("rank 1, last worked = A's date", er?.items?.[0]?.rank === 1 && er.items[0].lastWorked === finalA.serviceDate, er?.items?.[0]);
  check("chart has a bar per day with A's day = 1", er?.chart?.unit === "day" && er.chart.bars.find((b) => b.from === finalA.serviceDate)?.count === 1, er?.chart?.unit);
  const empNo = er.items[0].empNo;
  const es = expect("One employee's sessions", await admin.get(`/api/reports/employees/${empNo}`), 200);
  check("lists booking A with its invoice", es?.sessions?.length === 1 && es.sessions[0].bookingNo === finalA.bookingNo && /^INV-/.test(es.sessions[0].invoiceNo ?? ""), es?.sessions);
  expect("Unknown employee → 404", await admin.get("/api/reports/employees/EMP-9999"), 404);
  expect("Employee report: from after to", await admin.get(`/api/reports/employees?from=${TODAY}&to=${YESTERDAY}`), 400);
  expect("Employee report: future date", await admin.get(`/api/reports/employees?to=${TOMORROW}`), 400);
  const erM = expect("Manager employee report", await mgr.get(`/api/reports/employees?branchId=${gmp.id}`), 200);
  check("manager: KDW session counted (branchId ignored)", erM?.totals?.sessions === 1, erM?.totals);
  const erG = expect("Director: GMP only", await admin.get(`/api/reports/employees?branchId=${gmp.id}`), 200);
  check("no finished sessions at GMP", erG?.total === 0, erG?.total);
  expect("No login: employee report", await anon.get("/api/reports/employees"), 401);

  section("Excel exports");
  // The test server runs without Google keys, so Drive is "not connected".
  const xl = expect("Export employee report → download", await admin.post("/api/exports", { report: "employees", destination: "download", filters: {} }), 200);
  check("xlsx file returned (zip 'PK' header)", Buffer.from(xl?.file ?? "", "base64").subarray(0, 2).toString() === "PK", xl?.fileName);
  check("file name has the period", /^Employee report \d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2} - All branches\.xlsx$/.test(xl?.fileName ?? ""), xl?.fileName);
  const xl1 = expect("Export one employee", await admin.post("/api/exports", { report: "employee", empNo, destination: "download", filters: {} }), 200);
  check("one-employee file", xl1?.rows === 1 && xl1.fileName.includes(empNo), xl1?.fileName);
  const xa = expect("Export customer report (today)", await call.post("/api/exports", { report: "activity", destination: "download", filters: { from: TODAY, to: TODAY } }), 200);
  check("customer report rows = 4 bookings", xa?.rows === 4, xa?.rows);
  expect("Drive not connected → 400", await admin.post("/api/exports", { report: "employees", destination: "drive", filters: {} }), 400);
  expect("Manager may save to Drive (not connected → 400, not 403)", await mgr.post("/api/exports", { report: "employees", destination: "both", filters: {} }), 400);
  expect("Manager can download", await mgr.post("/api/exports", { report: "employees", destination: "download", filters: {} }), 200);
  expect("Bad filters → 400", await admin.post("/api/exports", { report: "employees", destination: "download", filters: { from: TOMORROW } }), 400);
  expect("Unknown report → 400", await admin.post("/api/exports", { report: "payroll", destination: "download" }), 400);
  expect("No login: export", await anon.post("/api/exports", { report: "employees", destination: "download" }), 401);

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

  section("Bookings for several days");
  const home2 = { customerId: cust2.id, patientId: p2.id, locationType: "home", serviceAddress: "5 Lake Rd" };
  expect("0 days rejected", await call.post("/api/bookings", { ...home2, serviceDate: TOMORROW, days: 0 }), 400);
  expect("31 days rejected", await call.post("/api/bookings", { ...home2, serviceDate: TOMORROW, days: 31 }), 400);
  const bM = expect("3-day booking from tomorrow", await call.post("/api/bookings", { ...home2, serviceDate: TOMORROW, days: 3 }), 201);
  check("days 3, last day = tomorrow + 2", bM?.days === 3 && bM?.endDate === plus(3), bM);
  expect("Confirm the 3-day booking", await call.post(`/api/bookings/${bM.id}/confirm`), 200);
  const avM = expect("Free for all 3 days", await call.get(`/api/bookings/${bM.id}/available-employees`), 200);
  check("employee 2 (booked tomorrow) not free for the 3 days", avM?.days === 3 && !avM.employees.some((e) => e.id === e2.id), avM);
  const clashM = await call.post(`/api/bookings/${bM.id}/assign`, { employeeId: e2.id });
  expect("Assign over another booking's day", clashM, 409);
  check("says which booking clashes", clashM.body?.error?.includes(bB.bookingNo), clashM.body);
  const empM = expect("New caregiver for this test", await admin.post("/api/employees", { branchId: kdw.id, firstName: "Multi", lastName: "Day", gender: "female", phone: "0711111199" }), 201);
  const avM2 = expect("Free list again", await call.get(`/api/bookings/${bM.id}/available-employees`), 200);
  check("new caregiver is free for all 3 days", avM2?.employees?.some((e) => e.id === empM.id));
  expect("Assign the 3-day booking to a free caregiver", await call.post(`/api/bookings/${bM.id}/assign`, { employeeId: empM.id }), 200);
  const bN = expect("1-day booking on day 2 of the 3", await call.post("/api/bookings", { ...home2, serviceDate: plus(2) }), 201);
  expect("Confirm it", await call.post(`/api/bookings/${bN.id}/confirm`), 200);
  expect("Caregiver is busy inside the 3 days", await call.post(`/api/bookings/${bN.id}/assign`, { employeeId: empM.id }), 409);
  expect("Leave inside the 3 days blocked", await admin.post(`/api/employees/${empM.id}/leaves`, { fromDate: plus(3), toDate: plus(3) }), 409);
  const short = expect("Shorten to 1 day while assigned", await call.patch(`/api/bookings/${bM.id}`, { days: 1 }), 200);
  check("now 1 day", short?.days === 1 && short?.endDate === TOMORROW && short?.status === "assigned", short);
  expect("Now the caregiver is free on day 2", await call.post(`/api/bookings/${bN.id}/assign`, { employeeId: empM.id }), 200);
  const longer = await call.patch(`/api/bookings/${bM.id}`, { days: 3 });
  expect("Can't lengthen over another booking", longer, 409);
  check("explains the clash", longer.body?.error?.includes(bN.bookingNo), longer.body);
  expect("Other details stay locked while assigned", await call.patch(`/api/bookings/${bM.id}`, { startTime: "09:00" }), 409);
  expect("Deliver before the last day", await call.post(`/api/bookings/${bM.id}/deliver`), 400);
  const lst = expect("Booking list by a middle day", await call.get(`/api/bookings?date=${plus(2)}&status=assigned`), 200);
  check("finds the booking running that day", lst?.items?.some((b) => b.id === bN.id), lst?.items?.map((b) => b.bookingNo));
  expect("Clean up: cancel", await call.post(`/api/bookings/${bM.id}/ignore`), 200);
  expect("Clean up: cancel", await call.post(`/api/bookings/${bN.id}/ignore`), 200);

  section("Branch manager workflow");
  const gmgrUser = expect("Create GMP branch manager", await admin.post("/api/users", { name: "GMP Manager", email: "gmgr@test.lk", password: "Mgr@12345", role: "branch_manager", branchId: gmp.id }), 201);
  const gmgr = client("gmp-manager");
  expect("GMP manager login", await gmgr.login("gmgr@test.lk", "Mgr@12345"), 200);
  check("GMP manager created", gmgrUser?.role === "branch_manager" && gmgrUser?.branchId === gmp.id, gmgrUser);
  const mMe = expect("Manager /api/auth/me", await mgr.get("/api/auth/me"), 200);
  check("manager permissions", ["createBooking", "useCallList", "assignEmployee", "markDelivered", "printInvoice", "manageEmployees", "manageCustomers", "saveReportsToDrive"].every((p) => mMe?.permissions?.includes(p)) && !mMe?.permissions?.includes("manageUsers"), mMe?.permissions);
  expect("Manager still can't manage users", await mgr.get("/api/users"), 403);
  expect("Manager searches all customers", await mgr.get("/api/customers?q=Other"), 200);
  const mCust = expect("Manager registers a customer", await mgr.post("/api/customers", { firstName: "Branch", lastName: "Walkin", phone: "0778888777" }), 201);
  const mPat = expect("Manager adds a patient", await mgr.post(`/api/customers/${mCust.id}/patients`, { firstName: "Walkin", lastName: "Patient", gender: "female" }), 201);
  const hNew = { customerId: mCust.id, patientId: mPat.id, locationType: "home", serviceAddress: "9 Temple Rd" };
  const bH = expect("Manager creates a booking", await mgr.post("/api/bookings", { ...hNew, serviceDate: plus(5) }), 201);
  check("new booking has no branch yet", bH?.branchId === null && bH?.status === "pending", bH);
  const gList = expect("Other branch manager sees the new booking", await gmgr.get(`/api/bookings/${bH.id}`), 200);
  check("…pending", gList?.status === "pending");
  const mCl = expect("Manager call list for that day", await mgr.get(`/api/call-list?date=${plus(5)}&view=pending`), 200);
  check("call list shows it", mCl?.items?.some((b) => b.id === bH.id));
  expect("Manager edits the pending booking", await mgr.patch(`/api/bookings/${bH.id}`, { notes: "Call before 9am" }), 200);
  expect("Manager confirms it", await mgr.post(`/api/bookings/${bH.id}/confirm`), 200);
  const mAv = expect("Manager: free employees", await mgr.get(`/api/bookings/${bH.id}/available-employees`), 200);
  check("only own branch's employees offered", mAv?.employees?.length > 0 && mAv.employees.every((e) => e.branchId === kdw.id), mAv?.employees?.map((e) => e.branchName));
  const mAll = expect("Manager: /api/employees/available", await mgr.get(`/api/employees/available?date=${plus(5)}&branchId=${gmp.id}`), 200);
  check("branchId param can't widen it", mAll?.every?.((e) => e.branchId === kdw.id), mAll);
  const xAssign = await mgr.post(`/api/bookings/${bH.id}/assign`, { employeeId: e3.id });
  expect("Manager can't assign another branch's employee", xAssign, 403);
  check("explains why", xAssign.body?.error?.includes("another branch"), xAssign.body);
  const aH = expect("Manager assigns own employee", await mgr.post(`/api/bookings/${bH.id}/assign`, { employeeId: e1.id }), 200);
  check("booking now belongs to KDW", aH?.branchId === kdw.id && aH?.status === "assigned", aH);
  expect("GMP manager can no longer open it", await gmgr.get(`/api/bookings/${bH.id}`), 404);
  expect("GMP manager can't reassign it", await gmgr.post(`/api/bookings/${bH.id}/assign`, { employeeId: e3.id }), 403);
  expect("GMP manager can't cancel it", await gmgr.post(`/api/bookings/${bH.id}/ignore`), 403);
  expect("Manager unassigns", await mgr.post(`/api/bookings/${bH.id}/unassign`), 200);
  expect("GMP manager sees it again (no branch)", await gmgr.get(`/api/bookings/${bH.id}`), 200);
  expect("GMP manager assigns own employee", await gmgr.post(`/api/bookings/${bH.id}/assign`, { employeeId: e3.id }), 200);
  expect("KDW manager can't open it now", await mgr.get(`/api/bookings/${bH.id}`), 404);
  expect("KDW manager can't touch GMP booking G", await mgr.post(`/api/bookings/${bG.id}/unassign`), 403);
  const mWa = expect("GMP manager sends the booking on WhatsApp", await gmgr.post(`/api/bookings/${bH.id}/whatsapp`), 200);
  check("booking WhatsApp link", mWa?.waUrl?.startsWith("https://wa.me/94778888777"), mWa?.waUrl);
  expect("Clean up: GMP manager cancels H", await gmgr.post(`/api/bookings/${bH.id}/ignore`), 200);

  // Register an employee, record leave, deliver a booking and run the invoice steps.
  const mEmp = expect("Manager registers an employee (own branch)", await mgr.post("/api/employees", { branchId: kdw.id, firstName: "Branch", lastName: "Hire", gender: "female", phone: "0711111188" }), 201);
  expect("Manager edits own employee", await mgr.patch(`/api/employees/${mEmp.id}`, { address: "Kadawatha" }), 200);
  expect("Manager can't move an employee to another branch", await mgr.patch(`/api/employees/${mEmp.id}`, { branchId: gmp.id }), 403);
  expect("Manager can't edit GMP employee", await mgr.patch(`/api/employees/${e3.id}`, { address: "x" }), 404);
  const mLeave = expect("Manager records leave", await mgr.post(`/api/employees/${mEmp.id}/leaves`, { fromDate: plus(20), toDate: plus(21) }), 201);
  expect("Manager deletes the leave", await mgr.del(`/api/leaves/${mLeave.id}`), 200);
  const bJ = expect("Manager books today", await mgr.post("/api/bookings", { ...hNew, serviceDate: TODAY }), 201);
  expect("…confirms", await mgr.post(`/api/bookings/${bJ.id}/confirm`), 200);
  expect("…assigns the new employee", await mgr.post(`/api/bookings/${bJ.id}/assign`, { employeeId: mEmp.id }), 200);
  const dJ = expect("Manager delivers", await mgr.post(`/api/bookings/${bJ.id}/deliver`), 200);
  check("invoice created", dJ?.invoiceId > 0, dJ);
  expect("GMP manager can't open the KDW invoice", await gmgr.get(`/api/invoices/${dJ.invoiceId}`), 404);
  expect("Manager records the print", await mgr.post(`/api/invoices/${dJ.invoiceId}/print`), 200);
  expect("Manager marks it printed", await mgr.post(`/api/invoices/${dJ.invoiceId}/mark-printed`), 200);
  expect("Manager sends the invoice on WhatsApp", await mgr.post(`/api/invoices/${dJ.invoiceId}/whatsapp`), 200);
  expect("Manager deactivates own employee", await mgr.patch(`/api/employees/${mEmp.id}`, { status: "inactive" }), 200);
  expect("Logout GMP manager", await gmgr.post("/api/auth/logout"), 200);

  section("Sidebar search");
  const sr = expect("Search a booking number", await admin.get(`/api/search?q=${bA.bookingNo}`), 200);
  check("finds the booking", sr?.bookings?.some((b) => b.bookingNo === bA.bookingNo), sr);
  const sc = expect("Search a customer phone (+94 form)", await admin.get("/api/search?q=%2B94%2077%20999%209999"), 200);
  check("finds the customer by phone", sc?.customers?.some((c) => c.id === cust2.id), sc);
  const se = expect("Search an employee", await admin.get("/api/search?q=Sunil"), 200);
  check("finds the employee", se?.employees?.some((e) => e.id === e3.id), se);
  const s1 = expect("One letter", await admin.get("/api/search?q=S"), 200);
  check("1 letter → nothing", s1?.bookings?.length === 0 && s1.customers.length === 0 && s1.employees.length === 0);
  check("% is a normal character", (await admin.get("/api/search?q=%25%25")).data?.employees?.length === 0);
  const sm = expect("Manager searches GMP employee", await mgr.get("/api/search?q=Sunil"), 200);
  check("manager doesn't find other branch's employee", sm?.employees?.length === 0, sm);
  const smb = expect("Manager searches GMP booking", await mgr.get(`/api/search?q=${bG.bookingNo}`), 200);
  check("manager doesn't find other branch's booking", smb?.bookings?.length === 0, smb);
  expect("No login: search", await anon.get("/api/search?q=test"), 401);

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
