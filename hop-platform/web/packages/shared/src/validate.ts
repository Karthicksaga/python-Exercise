// Client-side mirrors of the server rules, so people see a clear message before the request is sent.
export const phoneProblem = (v: string) => (/^[6-9]\d{9}$/.test(v) ? "" : "Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9");
export const codeProblem = (v: string) => (/^\d{6}$/.test(v) ? "" : "Enter the 6-digit code");

const ref = /^[A-Za-z0-9][A-Za-z0-9 /._-]{3,38}[A-Za-z0-9]$/;
const upi = /^[A-Za-z0-9._-]{2,128}@[A-Za-z0-9.-]{2,64}$/;
export const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

export function applicationProblem(f: Record<string, FormDataEntryValue>): string {
  const plate = String(f.vehicle_number ?? "").replace(/[\s-]/g, "").toUpperCase();
  if (!f.area_id) return "Choose your service area";
  if (!/^[A-Z0-9]{6,12}$/.test(plate) || !/[A-Z]/.test(plate) || !/\d/.test(plate)) return "Enter the vehicle registration number, for example KA01AB1234";
  if (!ref.test(String(f.license_reference ?? "").trim())) return "Enter your driving licence number (5-40 letters, digits, spaces, / . _ -)";
  if (!ref.test(String(f.insurance_reference ?? "").trim())) return "Enter your insurance policy number (5-40 letters, digits, spaces, / . _ -)";
  const id = String(f.upi_id ?? "").trim();
  if (id && !upi.test(id)) return "Enter a valid UPI ID such as name@bank";
  for (const [label, key] of [["Driving licence", "license_expires"], ["Insurance", "insurance_expires"]] as const) {
    const d = String(f[key] ?? "");
    if (!d) return `${label} expiry date is required`;
    if (d < today()) return `${label} has expired; renew it before applying`;
  }
  return "";
}
