import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";

// Provisioning is deliberately separate from deployment and must never target
// the local QA or production project. Run only after project approval.
const ref = process.env.SELAN_DEMO_SUPABASE_PROJECT_REF;
const apiUrl = process.env.DEMO_SUPABASE_URL;
const email = process.env.DEMO_OWNER_EMAIL;
const password = process.env.DEMO_OWNER_PASSWORD;
if (process.env.SELAN_REMOTE_DEMO !== "1" || process.env.DEMO_SEED_CONFIRM !== `seed:${ref}` ||
    !ref || !/^[a-z0-9]{20}$/.test(ref) || ref === "verxxsjbewmkgoxwqvxo" ||
    apiUrl !== `https://${ref}.supabase.co` ||
    !process.env.DEMO_SUPABASE_SERVICE_ROLE_KEY ||
    !email?.endsWith("@example.test") || !password || password.length < 20) {
  throw new Error("Refusing to seed without an approved isolated demo project and synthetic owner");
}
const db = createClient(apiUrl, process.env.DEMO_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: existing, error: lookupError } = await db.from("organizations")
  .select("id").eq("slug", "avtoservis-selan").maybeSingle();
if (lookupError || existing) throw new Error("Demo seed requires an empty organization slug; no reset is performed");

async function insert(table, rows) {
  const { error } = await db.from(table).insert(rows);
  if (error) throw new Error(`Demo seed ${table}: ${error.code ?? "insert_failed"}`);
}
const { data: created, error: authError } = await db.auth.admin.createUser({
  email, password, email_confirm: true,
});
if (authError || !created.user) throw new Error(`Demo owner: ${authError?.code ?? "create_failed"}`);
const owner = created.user.id;
const org = randomUUID();
await insert("organizations", { id: org, name: "Avtoservis Selan – demo", slug: "avtoservis-selan" });
await insert("organization_memberships", { organization_id: org, profile_id: owner, role: "owner" });

const people = [
  ["Nina Demo", "+38640555101", "nina.demo@example.test", "TST00000000000006", "LJ DEMO1", "Sintetična servisna storitev"],
  ["Luka Demo", "+38640555102", "luka.demo@example.test", "TST00000000000007", "LJ DEMO2", "Menjava filtra"],
  ["Maja Demo", "+38640555103", "maja.demo@example.test", "TST00000000000008", "LJ DEMO3", "Pregled in popravilo"],
  ["Rok Demo", "+38640555104", "rok.demo@example.test", "TST00000000000009", "LJ DEMO4", "Pregled vozila"],
  ["Sara Demo", "+38640555105", "sara.demo@example.test", "TST00000000000010", "LJ DEMO5", "Servis z izbiro termina"],
];
const cases = [];
for (const [name, phone, personEmail, vin, registration, service] of people) {
  const customerId = randomUUID();
  const vehicleId = randomUUID();
  const caseId = randomUUID();
  await insert("customers", { id: customerId, organization_id: org, display_name: name,
    phone, email: personEmail, source: "manual" });
  await insert("vehicles", { id: vehicleId, organization_id: org, customer_id: customerId,
    vin, registration_current: registration, make: "Test", model: "Demo" });
  cases.push({ customerId, vehicleId, caseId, name, phone, personEmail, vin, registration, service });
}
const statuses = ["preparing_offer", "new", "preparing_offer", "preparing_offer", "awaiting_slot_selection"];
await insert("service_requests", cases.map((item, index) => ({
  id: item.caseId, organization_id: org, customer_id: item.customerId, vehicle_id: item.vehicleId,
  status: statuses[index], source: "manual", summary: `${item.service} – ${item.name}`,
  service_wanted: item.service, missing_fields: [],
})));

// A: confirmed synthetic Quibi customer and vehicle, plus one READ-derived document ID/digest.
const [quibi] = cases;
const normalize = (value) => value.trim().replace(/\s+/g, " ");
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const customerFingerprint = digest([quibi.name, quibi.phone, quibi.personEmail]
  .map((value) => normalize(value).toLocaleLowerCase("sl-SI")));
const vehicleFingerprint = digest([quibi.vin, quibi.registration, "Test", "Quibi"]
  .map((value) => normalize(value).toLocaleUpperCase("sl-SI")));
await insert("integration_links", { organization_id: org, provider: "quibi", entity_type: "customer",
  entity_id: quibi.customerId, external_id: "2001", local_fingerprint: customerFingerprint,
  external_fingerprint: customerFingerprint, confirmed_by: owner });
// Keep the local model identical to the synthetic Quibi fixture before linking.
const { error: vehicleError } = await db.from("vehicles").update({ model: "Quibi" })
  .eq("organization_id", org).eq("id", quibi.vehicleId);
if (vehicleError) throw new Error(`Demo vehicle: ${vehicleError.code ?? "update_failed"}`);
await insert("quibi_vehicle_links", { organization_id: org, customer_id: quibi.customerId,
  vehicle_id: quibi.vehicleId, quibi_customer_id: "2001", quibi_vehicle_id: "5001",
  local_fingerprint: vehicleFingerprint, external_fingerprint: vehicleFingerprint, confirmed_by: owner,
  sync_status: "ok" });
await insert("offer_preparations", { organization_id: org, service_request_id: quibi.caseId,
  created_by_profile_id: owner, status: "ready_for_provider" });
const { data: registered, error: registerError } = await db.rpc("register_manual_quibi_estimate", {
  p_organization_id: org, p_service_request_id: quibi.caseId, p_quibi_customer_id: "2001",
  p_external_id: "4001", p_content_sha256: digest({ id: "4001", customerId: "2001",
    amount: "285.00", status: "Osnutek", lines: [{ description: "Sintetična servisna storitev",
      quantity: "1", grossPrice: "285.00" }] }), p_actor_id: owner,
});
if (registerError || registered?.ok !== true) {
  throw new Error(`Demo quote link: ${registerError?.code ?? registered?.error_code ?? "register_failed"}`);
}

// C/D: two explicit inspection outcomes. No inspection price or invoice is invented.
for (const [index, decision] of [[2, "ordered"], [3, "not_ordered"]]) {
  await insert("preliminary_inspections", { organization_id: org, service_request_id: cases[index].caseId,
    status: "completed", findings: "Sintetičen pregled vozila za predstavitev postopka.",
    completed_at: new Date().toISOString(), repair_decision: decision,
    decided_at: new Date().toISOString(), created_by_profile_id: owner });
}

// E: three proposed options, never sent or booked. Future dates keep the demo usable.
const first = new Date(); first.setDate(first.getDate() + 14); first.setHours(8, 0, 0, 0);
const slot = (days) => new Date(first.getTime() + days * 86400000).toISOString();
await insert("manual_slot_offers", { organization_id: org, service_request_id: cases[4].caseId,
  appointment_type: "service", version_no: 1, slot_1: slot(0), slot_2: slot(1), slot_3: slot(2),
  status: "proposed", availability_reference: "QA-SIM-AVAILABILITY-01", created_by_profile_id: owner });

const { data: memberships, error: membershipError } = await db.from("organization_memberships")
  .select("organization_id").eq("profile_id", owner);
if (membershipError || memberships?.length !== 1 || memberships[0].organization_id !== org) {
  throw new Error("Demo owner must belong to exactly one demo organization");
}
console.log("Synthetic remote demo seed prepared: five cases, one demo-only owner, no messages sent.");
