// Sets up the people the ride test needs, through the real API: an operator, and a captain
// (auto-rickshaw, Chennai) that the operator approves. Run by e2e/run-local.sh.
import { execFileSync } from "node:child_process";
const API = process.env.HOP_E2E_API || "http://127.0.0.1:8081";
const DB = process.env.HOP_E2E_DATABASE_URL;
const CHENNAI = "e1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b";
const [operatorPhone, captainPhone] = process.argv.slice(2);
if (!DB || !operatorPhone || !captainPhone) throw new Error("Usage: HOP_E2E_DATABASE_URL=… node e2e/seed.mjs <operator phone> <captain phone>");
const sql = (q) => execFileSync("psql", [DB, "-v", "ON_ERROR_STOP=1", "-tAc", q]).toString().trim();

class Client {
  constructor(app) { this.app = app; this.cookie = ""; this.csrf = ""; }
  async req(method, path, body) {
    const res = await fetch(API + path, {
      method,
      headers: { "Content-Type": "application/json", Origin: API, "X-Hop-App": this.app, ...(this.cookie ? { Cookie: this.cookie } : {}), ...(this.csrf ? { "X-CSRF-Token": this.csrf } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) this.cookie = set.map((c) => c.split(";")[0]).join("; ");
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${typeof json === "object" ? json.error : json}`);
    return json;
  }
  async login(phone) {
    const requested = await this.req("POST", "/auth/otp/request", { phone });
    const verified = await this.req("POST", "/auth/otp/verify", { phone, code: requested.dev_code });
    this.csrf = verified.csrf;
    const me = await this.req("GET", "/api/me");
    this.csrf = me.csrf || this.csrf;
    return me.user;
  }
}

const operator = new Client("admin");
const operatorUser = await operator.login(operatorPhone);
sql(`UPDATE accounts SET role='operator' WHERE id='${operatorUser.id}'`); // no API grants this role
const captain = new Client("captain");
const captainUser = await captain.login(captainPhone);
await captain.req("POST", "/api/drivers/apply", { area_id: CHENNAI, vehicle_category: "auto", vehicle_make: "Bajaj", vehicle_model: "RE Compact", vehicle_color: "Yellow", vehicle_number: "TN09AB1234", upi_id: "captain@okhop" });
await operator.req("POST", `/api/admin/drivers/${captainUser.id}`, {
  identity_ok: true, license_ok: true, rc_ok: true, insurance_ok: true, vehicle_ok: true, police_ok: true,
  police_reference: "PCC-E2E-0001", status: "approved", note: "Local end-to-end test approval", area_id: CHENNAI,
});
console.log(`seed: captain ${captainUser.name} approved (${sql(`SELECT status FROM drivers WHERE user_id='${captainUser.id}'`)})`);
