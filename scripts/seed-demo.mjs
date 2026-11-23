/**
 * Fills an EMPTY test database with realistic demo data through the API
 * (branches, staff, caregivers, hospitals, customers and a week of bookings).
 *
 *   1. Fresh database + one Director login (create-user)
 *   2. npm run dev
 *   3. npm run seed:demo     (ADMIN_EMAIL / ADMIN_PASSWORD env vars if not the defaults)
 *
 * Demo logins created: call@demo.lk / Call@1234, mgr.kdw@demo.lk / Mgr@12345
 */
/** "W. A. Nimal Fernando" → { firstName: "W.", middleName: "A. Nimal", lastName: "Fernando" } */
const splitName = (full) => {
  const p = full.trim().replace(/^(Mr|Mrs|Ms|Miss|Dr|Rev)\.?\s+/i, "").split(/\s+/);
  return { firstName: p[0], ...(p.length > 2 ? { middleName: p.slice(1, -1).join(" ") } : {}), lastName: p.length > 1 ? p.at(-1) : p[0] };
};

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const ADMIN = { email: process.env.ADMIN_EMAIL ?? "admin@test.lk", password: process.env.ADMIN_PASSWORD ?? "Admin@1234" };

let cookie = "";
async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get("set-cookie");
  if (set?.includes("cb_session=")) cookie = `cb_session=${set.match(/cb_session=([^;]*)/)[1]}`;
  const json = await res.json();
  if (!json.ok) throw new Error(`${method} ${path} → ${res.status} ${json.error} ${JSON.stringify(json.fieldErrors ?? "")}`);
  return json.data;
}
const post = (p, b = {}) => call("POST", p, b);

const lk = new Date(Date.now() + 5.5 * 3600e3);
const day = (n) => new Date(lk.getTime() + n * 86400e3).toISOString().slice(0, 10);

async function main() {
  await post("/api/auth/login", ADMIN);
  await call("PATCH", "/api/settings", { company_name: "Niluksha Care Services", company_address: "No. 25, Kandy Road, Kadawatha", company_phone: "011 292 5566" });

  const kdw = await post("/api/branches", { code: "KDW", name: "Kadawatha", phone: "0112925566", address: "Kandy Rd, Kadawatha" });
  const gmp = await post("/api/branches", { code: "GMP", name: "Gampaha", phone: "0332223344", address: "Bauddhaloka Mw, Gampaha" });
  const nug = await post("/api/branches", { code: "NUG", name: "Nugegoda", phone: "0112812233", address: "High Level Rd, Nugegoda" });

  await post("/api/users", { name: "Dilini Fernando", email: "call@demo.lk", password: "Call@1234", role: "call_center" });
  const mgr = await post("/api/users", { name: "Kasun Perera", email: "mgr.kdw@demo.lk", password: "Mgr@12345", role: "branch_manager", branchId: kdw.id });
  await call("PATCH", `/api/branches/${kdw.id}`, { managerUserId: mgr.id });

  const day12 = await post("/api/packages", { name: "Day shift 12 hours", durationHours: 12, price: 2500, description: "08:00 to 20:00 care" });
  const night12 = await post("/api/packages", { name: "Night shift 12 hours", durationHours: 12, price: 2800, description: "20:00 to 08:00 care" });
  const h1 = await post("/api/hospitals", { name: "Asiri Central Hospital", type: "private", city: "Colombo 10", phone: "0114665500" });
  const h2 = await post("/api/hospitals", { name: "Gampaha District General", type: "government", city: "Gampaha", phone: "0332222261" });
  await post("/api/hospitals", { name: "Nawaloka Hospital", type: "private", city: "Colombo 2", phone: "0115577111" });

  const staff = [
    [kdw, "Nimali Perera", "female", "Caregiver"],
    [kdw, "Kumari Silva", "female", "Nurse"],
    [kdw, "Sanduni Jayawardena", "female", "Caregiver"],
    [kdw, "Ruwan Bandara", "male", "Caregiver"],
    [gmp, "Sunil Fernando", "male", "Caregiver"],
    [gmp, "Chathurika Dias", "female", "Nurse"],
    [gmp, "Malani Wijesinghe", "female", "Caregiver"],
    [nug, "Ishara Gunasekara", "female", "Caregiver"],
    [nug, "Pradeep Kumara", "male", "Nurse"],
    [kdw, "Tharushi Madushani", "female", "Call Center"],
  ];
  const emps = [];
  for (const [i, [b, fullName, gender, designation]] of staff.entries()) {
    emps.push(await post("/api/employees", { branchId: b.id, ...splitName(fullName), gender, designation, phone: `077${String(1000000 + i * 1111).padStart(7, "0")}`, joinDate: day(-200 + i * 7) }));
  }
  await post(`/api/employees/${emps[6].id}/leaves`, { fromDate: day(0), toDate: day(2), reason: "Family function" });

  const people = [
    ["Ruwan Jayasinghe", "0771234567", "12 Temple Rd, Kadawatha", [["Mrs. Lalitha Jayasinghe", "female", "parent"]]],
    ["Shanika Rathnayake", "0712345678", "45 Lake Rd, Gampaha", [["Mr. Somapala Rathnayake", "male", "parent"]]],
    ["Ajith Wickramasinghe", "0759876543", "8/2 Station Rd, Nugegoda", [["Ajith Wickramasinghe", "male", "self"]]],
    ["Nadeesha Herath", "0723456789", "101 Kandy Rd, Kiribathgoda", [["Mrs. Kamala Herath", "female", "parent"], ["Mr. Gunadasa Herath", "male", "parent"]]],
    ["Chamara Senanayake", "0767654321", "22 Flower Rd, Ragama", [["Mrs. Iranganie Senanayake", "female", "spouse"]]],
    ["Priyanka De Silva", "0701122334", "3 Church St, Ja-Ela", [["Master Senuka De Silva", "male", "child"]]],
  ];
  const cust = [];
  for (const [fullName, phone, address, pats] of people) {
    cust.push(await post("/api/customers", { ...splitName(fullName), phone, address, city: address.split(", ").at(-1), patients: pats.map(([n, g, r]) => ({ ...splitName(n), gender: g, relationship: r })) }));
  }

  // Bookings: today + next 6 days, in different stages
  const plan = [
    [0, 0, "home", "deliver"], [0, 1, "hospital", "deliver"], [0, 2, "home", "assign"], [0, 3, "home", "confirm"],
    [0, 4, "home", null], [0, 5, "hospital", null], [0, 3, "home", "ignore"],
    [1, 0, "home", "assign"], [1, 1, "home", "confirm"], [1, 2, "hospital", null], [1, 4, "home", null],
    [2, 3, "home", null], [2, 5, "home", "confirm"], [3, 0, "hospital", null], [4, 2, "home", null], [5, 1, "home", null], [6, 4, "home", null],
  ];
  let e = 0;
  const times = ["07:00", "08:00", "09:30", "18:00", "19:00"];
  for (const [i, [d, c, loc, stage]] of plan.entries()) {
    const customer = cust[c];
    const patient = customer.patients[i % customer.patients.length];
    const b = await post("/api/bookings", {
      customerId: customer.id,
      patientId: patient.id,
      serviceDate: day(d),
      startTime: times[i % times.length],
      ...(i % 4 === 1 ? { packageId: day12.id } : i % 4 === 2 ? { packageId: night12.id } : {}), // others: default package
      locationType: loc,
      ...(loc === "hospital" ? { hospitalId: i % 2 ? h1.id : h2.id, wardNo: String(3 + (i % 5)), bedNo: String(10 + i) } : {}),
    });
    if (!stage) continue;
    if (stage === "ignore") {
      await post(`/api/bookings/${b.id}/ignore`, { note: "Customer said not needed" });
      continue;
    }
    await post(`/api/bookings/${b.id}/confirm`, { note: "Confirmed by phone" });
    if (stage === "confirm") continue;
    const free = await call("GET", `/api/bookings/${b.id}/available-employees`);
    const pick = free.employees[e++ % free.employees.length];
    await post(`/api/bookings/${b.id}/assign`, { employeeId: pick.id });
    if (stage === "deliver") await post(`/api/bookings/${b.id}/deliver`, { note: "Session completed" });
  }
  // One invoice already handed over
  const inv = await call("GET", "/api/invoices?status=generated");
  if (inv.items[0]) await post(`/api/invoices/${inv.items[0].id}/mark-printed`, {});

  console.log("✔ Demo data created: 3 branches, 10 employees, 3 hospitals, 6 customers, 17 bookings");
  console.log("  Logins: Director (yours) · call@demo.lk / Call@1234 · mgr.kdw@demo.lk / Mgr@12345");
}

main().catch((err) => {
  console.error("✖", err.message);
  process.exit(1);
});
