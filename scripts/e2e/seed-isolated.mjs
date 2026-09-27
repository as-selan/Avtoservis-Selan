import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

const { E2E_API_URL, E2E_SERVICE_ROLE_KEY, E2E_PASSWORD, E2E_FIXTURES_PATH } = process.env;
if (!E2E_API_URL || !E2E_SERVICE_ROLE_KEY || !E2E_PASSWORD || !E2E_FIXTURES_PATH) {
  throw new Error("E2E local seed configuration is incomplete");
}
const target = new URL(E2E_API_URL);
if (!["127.0.0.1", "localhost"].includes(target.hostname) || target.protocol !== "http:") {
  throw new Error("Refusing to seed a non-loopback Supabase target");
}
if (process.env.CI !== "true" || process.env.SELAN_ISOLATED_E2E !== "1") {
  throw new Error("Refusing to seed outside isolated CI");
}

const db = createClient(E2E_API_URL, E2E_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
async function insert(table, row) {
  const { error } = await db.from(table).insert(row);
  if (error) throw new Error(`${table}: ${error.code ?? "insert_failed"}`);
}
async function user(role) {
  const email = `selan-e2e-${role}@example.test`;
  const { data, error } = await db.auth.admin.createUser({
    email, password: E2E_PASSWORD, email_confirm: true,
  });
  if (error || !data.user) throw new Error(`auth user ${role}: ${error?.code ?? "create_failed"}`);
  return { email, id: data.user.id };
}
function fingerprint(name, phone, email) {
  const normalize = (value) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("sl-SI");
  return createHash("sha256").update(JSON.stringify([normalize(name), normalize(phone), normalize(email)])).digest("hex");
}

const owner = await user("owner");
const reception = await user("reception");
const mechanic = await user("mechanic");
const foreign = await user("foreign");
const org = randomUUID();
const otherOrg = randomUUID();
await insert("organizations", [
  { id: org, name: "Selan isolated E2E", slug: "avtoservis-selan" },
  { id: otherOrg, name: "Other isolated E2E", slug: "other-e2e" },
]);
await insert("organization_memberships", [
  { organization_id: org, profile_id: owner.id, role: "owner" },
  { organization_id: org, profile_id: reception.id, role: "reception" },
  { organization_id: org, profile_id: mechanic.id, role: "mechanic" },
  { organization_id: otherOrg, profile_id: foreign.id, role: "owner" },
]);
const customer = randomUUID();
const linkedCustomer = randomUUID();
const vehicle = randomUUID();
const caseId = randomUUID();
await insert("customers", [
  { id: customer, organization_id: org, display_name: "Ana Preizkus", phone: "+38640111222", email: "ana@example.test", source: "manual" },
  { id: linkedCustomer, organization_id: org, display_name: "Bor Preizkus", phone: "+38640333444", email: "bor@example.test", source: "manual" },
]);
await insert("vehicles", { id: vehicle, organization_id: org, customer_id: customer,
  registration_current: "LJ E2E", vin: "TST00000000000001", make: "Test", model: "Model" });
await insert("service_requests", { id: caseId, organization_id: org, customer_id: customer,
  vehicle_id: vehicle, status: "new", source: "manual", summary: "Izolirani E2E primer" });
await insert("integration_links", { organization_id: org, provider: "quibi", entity_type: "customer",
  entity_id: linkedCustomer, external_id: "2001", local_fingerprint: fingerprint("Bor Preizkus", "+38640333444", "bor@example.test"),
  external_fingerprint: fingerprint("Bor Preizkus", "+38640333444", "bor@example.test"), confirmed_by: owner.id });

await writeFile(E2E_FIXTURES_PATH, JSON.stringify({
  owner: owner.email, reception: reception.email, mechanic: mechanic.email, foreign: foreign.email,
  customer, linkedCustomer, vehicle, caseId,
}), { mode: 0o600 });
console.log("Isolated E2E users and synthetic business records seeded on loopback.");
