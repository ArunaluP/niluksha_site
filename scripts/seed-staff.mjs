/**
 * Adds sample BRANCHES, EMPLOYEES and HOSPITALS through the API. Safe to run on a database
 * that already has data, and safe to run more than once:
 *   - a branch whose code already exists is reused, not created again
 *   - an employee with the same NIC (or same name in the same branch) is skipped
 *   - a hospital with the same name and city is skipped
 *
 *   1. npm run dev
 *   2. npm run seed:staff     (ADMIN_EMAIL / ADMIN_PASSWORD env vars if not the defaults)
 */
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

// ------------------------------------------------------------------ data
const BRANCHES = [
  { code: "KDW", name: "Kadawatha", phone: "0112925566", address: "No. 25, Kandy Road, Kadawatha" },
  { code: "GMP", name: "Gampaha", phone: "0332223344", address: "No. 14, Bauddhaloka Mawatha, Gampaha" },
  { code: "NUG", name: "Nugegoda", phone: "0112812233", address: "No. 210, High Level Road, Nugegoda" },
  { code: "KDY", name: "Kandy", phone: "0812234455", address: "No. 7, Peradeniya Road, Kandy" },
  { code: "KUR", name: "Kurunegala", phone: "0372221188", address: "No. 52, Colombo Road, Kurunegala" },
  { code: "MTR", name: "Matara", phone: "0412226677", address: "No. 33, Anagarika Dharmapala Mawatha, Matara" },
];

// [branchCode, fullName, gender, designation, nic, dob, phone, address, qualifications, joinDate]
const EMPLOYEES = [
  ["KDW", "Nimali Perera", "female", "Caregiver", "198563201245", "1985-05-11", "0771234501", "12/3 Temple Road, Kadawatha", "NVQ Level 3 – Elderly Care", "2023-02-01"],
  ["KDW", "Kumari Silva", "female", "Nurse", "199071504782", "1990-08-03", "0712345602", "45 Mahara Road, Kadawatha", "Diploma in Nursing (Govt. School of Nursing)", "2022-06-15"],
  ["KDW", "Ruwan Bandara", "male", "Caregiver", "198812307654", "1988-05-02", "0759876503", "8 Ganemulla Road, Kadawatha", "First Aid certificate (Red Cross)", "2024-01-10"],
  ["KDW", "Tharushi Wickramasinghe", "female", "Call Center", "199865103321", "1998-05-30", "0763456704", "101 Kandy Road, Kiribathgoda", null, "2024-09-01"],

  ["GMP", "Sunil Fernando", "male", "Caregiver", "198219405563", "1982-07-13", "0772345605", "22 Yakkala Road, Gampaha", "NVQ Level 3 – Elderly Care", "2021-11-20"],
  ["GMP", "Chathurika Dias", "female", "Nurse", "199278902214", "1992-10-15", "0714567806", "6 Station Road, Gampaha", "BSc Nursing (Open University)", "2023-04-03"],
  ["GMP", "Malani Wijesinghe", "female", "Caregiver", "197975601987", "1979-09-12", "0705678907", "71 Miriswatta, Gampaha", "Caregiver training – 6 months (NAITA)", "2022-01-17"],
  ["GMP", "Lasantha Rajapaksha", "male", "Branch Manager", "198030112876", "1980-01-30", "0776789008", "15 Church Road, Gampaha", "Diploma in Business Management", "2020-08-01"],

  ["NUG", "Ishara Gunasekara", "female", "Caregiver", "199458806543", "1994-03-28", "0717890109", "3 Pagoda Road, Nugegoda", "NVQ Level 4 – Health Care", "2023-07-24"],
  ["NUG", "Pradeep Kumara", "male", "Nurse", "198734509876", "1987-12-10", "0778901210", "40 Stanley Thilakaratne Mawatha, Nugegoda", "Diploma in Nursing, ICU experience", "2021-03-08"],
  ["NUG", "Sanduni Jayawardena", "female", "Caregiver", "199681207712", "1996-11-07", "0769012311", "18 Gangodawila, Nugegoda", "First Aid certificate (St. John Ambulance)", "2025-02-12"],

  ["KDY", "Anoma Herath", "female", "Caregiver", "198367804433", "1983-06-26", "0810123412", "9 Katugastota Road, Kandy", "NVQ Level 3 – Elderly Care", "2022-10-05"],
  ["KDY", "Mahesh Dissanayake", "male", "Nurse", "199112603398", "1991-05-05", "0771234513", "27 Peradeniya Road, Kandy", "Diploma in Nursing (Kandy)", "2024-03-18"],
  ["KDY", "Rasika Ekanayake", "female", "Caregiver", "198972101176", "1989-08-08", "0712345614", "4 Ampitiya Road, Kandy", "Caregiver training – 6 months (NAITA)", "2023-12-01"],
  ["KDY", "Janaka Karunaratne", "male", "Branch Manager", "197814205521", "1978-05-21", "0753456715", "60 William Gopallawa Mawatha, Kandy", "MBA (University of Peradeniya)", "2020-05-11"],

  ["KUR", "Dilrukshi Senanayake", "female", "Caregiver", "199563309981", "1995-05-12", "0374567816", "11 Dambulla Road, Kurunegala", "NVQ Level 3 – Elderly Care", "2024-06-03"],
  ["KUR", "Nuwan Pathirana", "male", "Caregiver", "199020804410", "1990-07-26", "0775678917", "5 Puttalam Road, Kurunegala", "First Aid certificate (Red Cross)", "2023-09-19"],
  ["KUR", "Hiruni Abeysekara", "female", "Nurse", "199776502287", "1997-09-21", "0716789018", "38 North Lake Road, Kurunegala", "BSc Nursing (University of Peradeniya)", "2025-01-06"],

  ["MTR", "Gayani Liyanage", "female", "Caregiver", "198460707765", "1984-04-16", "0417890119", "19 Beach Road, Matara", "NVQ Level 3 – Elderly Care", "2022-03-14"],
  ["MTR", "Chaminda Weerasinghe", "male", "Nurse", "198631208843", "1986-11-07", "0778901220", "2 Hakmana Road, Matara", "Diploma in Nursing (Galle)", "2021-07-26"],
  ["MTR", "Sachini Amarasinghe", "female", "Caregiver", "199972804456", "1999-08-15", "0769012321", "44 Tangalle Road, Matara", "Caregiver training – 6 months (NAITA)", "2025-05-02"],
];

// [name, type, city, address, phone] — near each branch. Phone numbers are sample values.
const HOSPITALS = [
  ["National Hospital of Sri Lanka", "government", "Colombo 10", "Regent Street, Colombo 10", "0112691111"],
  ["Asiri Central Hospital", "private", "Colombo 10", "No. 114, Norris Canal Road, Colombo 10", "0114665500"],
  ["Nawaloka Hospital", "private", "Colombo 2", "No. 23, Deshamanya H.K. Dharmadasa Mawatha, Colombo 2", "0115577111"],
  ["Lanka Hospitals", "private", "Colombo 5", "No. 578, Elvitigala Mawatha, Colombo 5", "0115430000"],
  ["Colombo North Teaching Hospital", "government", "Ragama", "Hospital Road, Ragama", "0112959261"],
  ["Base Hospital Kiribathgoda", "government", "Kiribathgoda", "Kandy Road, Kiribathgoda", "0112911361"],
  ["District General Hospital Gampaha", "government", "Gampaha", "Hospital Road, Gampaha", "0332222261"],
  ["Nawaloka Hospital Gampaha", "private", "Gampaha", "No. 180, Colombo Road, Gampaha", "0332234455"],
  ["Colombo South Teaching Hospital", "government", "Kalubowila", "Hospital Road, Kalubowila, Dehiwala", "0112763261"],
  ["Ninewells Hospital", "private", "Nugegoda", "No. 55/1, Kirimandala Mawatha, Nugegoda", "0112049999"],
  ["National Hospital Kandy", "government", "Kandy", "William Gopallawa Mawatha, Kandy", "0812233337"],
  ["Suwasevana Hospital", "private", "Kandy", "No. 26, Peradeniya Road, Kandy", "0812224455"],
  ["Teaching Hospital Kurunegala", "government", "Kurunegala", "Hospital Road, Kurunegala", "0372222261"],
  ["Nawaloka Hospital Kurunegala", "private", "Kurunegala", "Colombo Road, Kurunegala", "0372233344"],
  ["District General Hospital Matara", "government", "Matara", "Hospital Road, Matara", "0412222261"],
  ["Asiri Hospital Matara", "private", "Matara", "No. 191, Anagarika Dharmapala Mawatha, Matara", "0412230000"],
];

// ------------------------------------------------------------------ run
async function main() {
  await post("/api/auth/login", ADMIN);

  const existingBranches = await call("GET", "/api/branches");
  const byCode = new Map(existingBranches.map((b) => [b.code, b]));
  let newBranches = 0;
  for (const b of BRANCHES) {
    if (byCode.has(b.code)) {
      console.log(`  · branch ${b.code} ${b.name} already exists — kept as is`);
      continue;
    }
    byCode.set(b.code, await post("/api/branches", b));
    newBranches++;
    console.log(`  + branch ${b.code} ${b.name}`);
  }

  const existingEmps = (await call("GET", "/api/employees?pageSize=100")).items;
  const seen = new Set(existingEmps.flatMap((e) => [e.nic, `${e.branchId}|${e.fullName.toLowerCase()}`]).filter(Boolean));
  let newEmps = 0;
  for (const [code, fullName, gender, designation, nic, dob, phone, address, qualifications, joinDate] of EMPLOYEES) {
    const branch = byCode.get(code);
    if (seen.has(nic) || seen.has(`${branch.id}|${fullName.toLowerCase()}`)) {
      console.log(`  · ${fullName} already exists — skipped`);
      continue;
    }
    const emp = await post("/api/employees", {
      branchId: branch.id, fullName, gender, designation, nic, dob, phone, address, joinDate,
      ...(qualifications ? { qualifications } : {}),
    });
    newEmps++;
    console.log(`  + ${emp.empNo} ${fullName} (${designation}, ${branch.name})`);
  }

  const existingHosp = await call("GET", "/api/hospitals");
  const hospKey = (name, city) => `${name.toLowerCase()}|${(city ?? "").toLowerCase()}`;
  const seenHosp = new Set(existingHosp.map((h) => hospKey(h.name, h.city)));
  let newHosp = 0;
  for (const [name, type, city, address, phone] of HOSPITALS) {
    if (seenHosp.has(hospKey(name, city))) {
      console.log(`  · hospital ${name} (${city}) already exists — skipped`);
      continue;
    }
    await post("/api/hospitals", { name, type, city, address, phone });
    newHosp++;
    console.log(`  + hospital ${name} (${type}, ${city})`);
  }

  console.log(`✔ Added ${newBranches} branch(es), ${newEmps} employee(s) and ${newHosp} hospital(s).`);
}

main().catch((err) => {
  console.error("✖", err.message);
  process.exit(1);
});
