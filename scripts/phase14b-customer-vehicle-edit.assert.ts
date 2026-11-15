/**
 * Phase 14B Slice B — customer and vehicle edit.
 * Run: npx --yes tsx scripts/phase14b-customer-vehicle-edit.assert.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isVinUniqueViolation,
  validateCustomerEdit,
  validateVehicleEdit,
} from "../src/lib/customers/validate-edit";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function extractFn(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}`);
  assert(start >= 0, `${name} found`);
  const nextExport = src.indexOf("\nexport ", start + 1);
  return src.slice(start, nextExport >= 0 ? nextExport : src.length);
}

const CUSTOMER_VEHICLE_EDIT_UNAVAILABLE = "Podatkov ni bilo mogoče posodobiti.";
const VIN_ALREADY_USED_MESSAGE = "VIN je že uporabljen pri drugem vozilu.";

const actionsSrc = read("src/lib/customers/actions.ts");
const validateSrc = read("src/lib/customers/validate-edit.ts");
const detailUi = read("src/components/customers/CustomerDetail.tsx");
const customerEditUi = read("src/components/customers/CustomerEditPanel.tsx");
const vehicleEditUi = read("src/components/customers/VehicleEditPanel.tsx");
const navigationSrc = read("src/lib/dashboard/navigation.ts");
const sliceAAssert = read("scripts/phase14b-customers-slice-a.assert.ts");

const mutationFiles = [
  "src/lib/customers/actions.ts",
  "src/lib/customers/validate-edit.ts",
  "src/components/customers/CustomerEditPanel.tsx",
  "src/components/customers/VehicleEditPanel.tsx",
  "src/components/customers/CustomerDetail.tsx",
];
const mutationSrc = stripComments(mutationFiles.map(read).join("\n"));

assert(actionsSrc.includes('"use server"'), "customer/vehicle actions are server actions");
assert(
  actionsSrc.includes("export async function updateCustomerAction"),
  "updateCustomerAction exported",
);
assert(
  actionsSrc.includes("export async function updateVehicleAction"),
  "updateVehicleAction exported",
);

const customerFn = extractFn(actionsSrc, "updateCustomerAction");
const vehicleFn = extractFn(actionsSrc, "updateVehicleAction");

assert(
  customerFn.includes("requirePhase1OperationalAccess()"),
  "customer mutation uses requirePhase1OperationalAccess()",
);
assert(
  vehicleFn.includes("requirePhase1OperationalAccess()"),
  "vehicle mutation uses requirePhase1OperationalAccess()",
);
assert(
  customerFn.includes("access.organizationId") &&
    vehicleFn.includes("access.organizationId"),
  "organization scope comes from access.organizationId",
);
assert(
  !/organizationId\s*[:=]\s*input/.test(actionsSrc) &&
    !actionsSrc.includes("input.organizationId") &&
    !actionsSrc.includes("organization_id: input"),
  "organization id is not taken from browser input",
);

assert(
  customerFn.includes('.from("customers")') &&
    customerFn.includes('.eq("id", input.customerId)') &&
    customerFn.includes('.eq("organization_id", access.organizationId)') &&
    customerFn.includes('.is("archived_at", null)') &&
    customerFn.includes('.select("id")') &&
    customerFn.includes("maybeSingle()"),
  "customer update scopes id + organization_id + archived_at and confirms a row",
);
assert(
  actionsSrc.includes("CUSTOMER_VEHICLE_EDIT_UNAVAILABLE") &&
    read("src/lib/customers/edit-messages.ts").includes(
      `"${CUSTOMER_VEHICLE_EDIT_UNAVAILABLE}"`,
    ),
  "customer unavailable uses neutral error constant",
);

assert(
  vehicleFn.includes('.from("vehicles")') &&
    vehicleFn.includes('.eq("id", input.vehicleId)') &&
    vehicleFn.includes('.eq("organization_id", access.organizationId)') &&
    vehicleFn.includes('.eq("customer_id", input.customerId)') &&
    vehicleFn.includes('.is("archived_at", null)') &&
    vehicleFn.includes('.select("id")') &&
    vehicleFn.includes("maybeSingle()"),
  "vehicle update scopes id + organization_id + customer_id + archived_at and confirms a row",
);
assert(
  vehicleFn.includes("mileage_latest_recorded_at") &&
    vehicleFn.includes("mileageChanged"),
  "mileage_latest_recorded_at updates only when mileage changes",
);
assert(
  !/\.update\([\s\S]*?\bcustomer_id\s*:/.test(vehicleFn),
  "vehicle update payload does not change customer_id",
);
assert(
  !/\.update\([\s\S]*?\barchived_at\s*:/.test(actionsSrc),
  "updates do not set archived_at",
);
assert(!/\.delete\(/.test(mutationSrc), "no DELETE in edit slice");
assert(
  !/ownership|transfer|archiveCustomer|archiveVehicle/i.test(mutationSrc),
  "no ownership-transfer or archive flows",
);

assert(!/service_role/i.test(mutationSrc), "no service_role");
assert(!/\/api2\/|QUIBI_DEV_PASSWORD|\.createDraft\s*\(/i.test(mutationSrc), "customer and vehicle edits never write to Quibi");
assert(!/myplanly/i.test(mutationSrc), "no MyPlanly");
assert(
  actionsSrc.includes('from "@/lib/supabase/server"') &&
    !actionsSrc.includes("SUPABASE_SERVICE_ROLE"),
  "mutations use publishable server client",
);

assert(
  vehicleFn.includes("isVinUniqueViolation") &&
    vehicleFn.includes("VIN_ALREADY_USED_MESSAGE") &&
    read("src/lib/customers/edit-messages.ts").includes(
      `"${VIN_ALREADY_USED_MESSAGE}"`,
    ),
  "VIN unique violation mapped to Slovenian form error",
);
assert(
  isVinUniqueViolation({
    code: "23505",
    message: 'duplicate key value violates unique constraint "vehicles_organization_id_vin_normalized_unique"',
  }),
  "VIN unique helper recognizes vin constraint",
);
assert(
  !isVinUniqueViolation({ code: "23505", message: "other_unique" }),
  "non-VIN unique violation is not treated as VIN",
);
assert(
  !isVinUniqueViolation({ code: "42501", message: "vin" }),
  "non-unique errors are not VIN conflicts",
);

const missingName = validateCustomerEdit({
  customerType: "individual",
  displayName: "  ",
  phone: "",
  email: "",
  notes: "",
});
assert(!missingName.ok && missingName.fieldErrors.displayName, "display_name required");

const badType = validateCustomerEdit({
  customerType: "vip",
  displayName: "Ana",
  phone: "",
  email: "",
  notes: "",
});
assert(!badType.ok && badType.fieldErrors.customerType, "customer_type validated");

const badEmail = validateCustomerEdit({
  customerType: "business",
  displayName: "Firma d.o.o.",
  phone: "",
  email: "not-an-email",
  notes: "",
});
assert(!badEmail.ok && badEmail.fieldErrors.email, "invalid email rejected");

const okCustomer = validateCustomerEdit({
  customerType: "individual",
  displayName: " Ana Novak ",
  phone: "  ",
  email: " Ana@Example.com ",
  notes: "  ",
});
assert(okCustomer.ok, "valid customer accepted");
if (okCustomer.ok) {
  assert(okCustomer.value.display_name === "Ana Novak", "display_name trimmed");
  assert(okCustomer.value.phone === null, "empty phone -> null");
  assert(okCustomer.value.email === "ana@example.com", "email normalized");
  assert(okCustomer.value.notes === null, "empty notes -> null");
  assert(okCustomer.value.customer_type === "individual", "customer_type kept");
}

const badYear = validateVehicleEdit({
  registration: "",
  vin: "",
  make: "VW",
  model: "Golf",
  year: "1800",
  powerKw: "",
  engine: "",
  engineType: "",
  fuel: "",
  notes: "",
  mileage: "",
});
assert(!badYear.ok && badYear.fieldErrors.year, "year range validated");

const badPower = validateVehicleEdit({
  registration: "",
  vin: "",
  make: "",
  model: "",
  year: "",
  powerKw: "0",
  engine: "",
  engineType: "",
  fuel: "",
  notes: "",
  mileage: "",
});
assert(!badPower.ok && badPower.fieldErrors.powerKw, "power_kw must be positive");

const badMileage = validateVehicleEdit({
  registration: "",
  vin: "",
  make: "",
  model: "",
  year: "",
  powerKw: "",
  engine: "",
  engineType: "",
  fuel: "",
  notes: "",
  mileage: "-1",
});
assert(!badMileage.ok && badMileage.fieldErrors.mileage, "mileage >= 0");

const badFuel = validateVehicleEdit({
  registration: "",
  vin: "",
  make: "",
  model: "",
  year: "",
  powerKw: "",
  engine: "",
  engineType: "",
  fuel: "bencin",
  notes: "",
  mileage: "",
});
assert(!badFuel.ok && badFuel.fieldErrors.fuel, "fuel must be DB enum");

const okVehicle = validateVehicleEdit({
  registration: " LJ-AB-123 ",
  vin: " wvwzzz ",
  make: " VW ",
  model: " Golf ",
  year: "2018",
  powerKw: "110",
  engine: " 1.5 ",
  engineType: " TSI ",
  fuel: "petrol",
  notes: "  ",
  mileage: "120000",
});
assert(okVehicle.ok, "valid vehicle accepted");
if (okVehicle.ok) {
  assert(okVehicle.value.registration_current === "LJ-AB-123", "registration trimmed");
  assert(okVehicle.value.vin === "wvwzzz", "vin trimmed without invented length rule");
  assert(okVehicle.value.year === 2018, "year parsed");
  assert(okVehicle.value.power_kw === 110, "power parsed");
  assert(okVehicle.value.mileage_latest_km === 120000, "mileage parsed");
  assert(okVehicle.value.notes === null, "empty vehicle notes -> null");
  assert(okVehicle.value.fuel === "petrol", "fuel kept");
}

assert(detailUi.includes("Uredi stranko"), "UI exposes Uredi stranko");
assert(detailUi.includes("Uredi vozilo"), "UI exposes Uredi vozilo");
assert(customerEditUi.includes("Shrani") && customerEditUi.includes("Prekliči"), "customer Save/Cancel");
assert(vehicleEditUi.includes("Shrani") && vehicleEditUi.includes("Prekliči"), "vehicle Save/Cancel");
assert(
  customerEditUi.includes("updateCustomerAction") &&
    vehicleEditUi.includes("updateVehicleAction"),
  "edit panels call server actions",
);
assert(
  !customerEditUi.includes(".from(\"customers\")") &&
    !vehicleEditUi.includes(".from(\"vehicles\")"),
  "browser UI does not perform direct table updates",
);

const strankeNav = navigationSrc.match(/id:\s*"customers"[\s\S]*?\n  \},/);
assert(strankeNav, "Stranke nav found");
assert(
  strankeNav![0].includes('href: "/dashboard/stranke"') &&
    strankeNav![0].includes("available: true"),
  "Slice A Stranke navigation remains intact",
);
assert(sliceAAssert.includes("phase14b-customers-slice-a"), "Slice A assert still present");

const migrations = readdirSync(resolve(process.cwd(), "supabase/migrations"));
assert(
  migrations.every(
    (name) =>
      !name.toLowerCase().includes("phase14b") &&
      !name.toLowerCase().includes("customer_vehicle_edit"),
  ),
  "no Phase 14B Slice B migration",
);
assert(!/create table/i.test(mutationSrc), "no DDL in edit slice");

assert(
  validateSrc.includes("validateCustomerEdit") &&
    validateSrc.includes("validateVehicleEdit"),
  "shared validators exported",
);

console.log("phase14b-customer-vehicle-edit.assert: PASS");
