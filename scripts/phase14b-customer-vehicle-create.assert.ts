/**
 * Phase 14B Slice C — create vehicle for existing active customer.
 * Run: npx --yes tsx scripts/phase14b-customer-vehicle-create.assert.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isVinUniqueViolation,
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

const CUSTOMER_VEHICLE_CREATE_UNAVAILABLE = "Vozila ni bilo mogoče dodati.";
const VIN_ALREADY_USED_MESSAGE = "VIN je že uporabljen pri drugem vozilu.";

const actionsSrc = read("src/lib/customers/actions.ts");
const messagesSrc = read("src/lib/customers/edit-messages.ts");
const detailUi = read("src/components/customers/CustomerDetail.tsx");
const createUi = read("src/components/customers/VehicleCreatePanel.tsx");
const vehicleEditUi = read("src/components/customers/VehicleEditPanel.tsx");
const customerEditUi = read("src/components/customers/CustomerEditPanel.tsx");
const navigationSrc = read("src/lib/dashboard/navigation.ts");
const sliceAAssert = read("scripts/phase14b-customers-slice-a.assert.ts");
const sliceBAssert = read("scripts/phase14b-customer-vehicle-edit.assert.ts");

const sliceCFiles = [
  "src/lib/customers/actions.ts",
  "src/lib/customers/edit-messages.ts",
  "src/lib/customers/validate-edit.ts",
  "src/components/customers/VehicleCreatePanel.tsx",
  "src/components/customers/CustomerDetail.tsx",
];
const sliceCSrc = stripComments(sliceCFiles.map(read).join("\n"));

assert(actionsSrc.includes('"use server"'), "create action module is a server action file");
assert(
  actionsSrc.includes("export async function createCustomerVehicleAction"),
  "createCustomerVehicleAction exported",
);

const createFn = extractFn(actionsSrc, "createCustomerVehicleAction");

assert(
  createFn.includes("requirePhase1OperationalAccess()"),
  "create action uses requirePhase1OperationalAccess()",
);
assert(
  createFn.includes("access.organizationId"),
  "organization_id comes from access.organizationId",
);
assert(
  !/organizationId\s*[:=]\s*input/.test(createFn) &&
    !createFn.includes("input.organizationId") &&
    !createFn.includes("organization_id: input"),
  "browser cannot provide organization_id",
);
assert(
  /organization_id:\s*access\.organizationId/.test(createFn) &&
    /customer_id:\s*customer\.id/.test(createFn),
  "insert organization_id is access.organizationId and customer_id is verified customer.id",
);

assert(
  createFn.includes('.from("customers")') &&
    createFn.includes('.eq("id", input.customerId)') &&
    createFn.includes('.eq("organization_id", access.organizationId)') &&
    createFn.includes('.is("archived_at", null)') &&
    createFn.includes("maybeSingle()"),
  "active target customer checked with id + organization_id + archived_at IS NULL",
);
assert(
  messagesSrc.includes(`"${CUSTOMER_VEHICLE_CREATE_UNAVAILABLE}"`) &&
    createFn.includes("CUSTOMER_VEHICLE_CREATE_UNAVAILABLE"),
  "missing/archived/cross-tenant customer returns neutral create unavailable message",
);

const insertBlockStart = createFn.indexOf('.from("vehicles")');
assert(insertBlockStart >= 0, "vehicles insert present");
const insertBlock = createFn.slice(insertBlockStart);
assert(
  insertBlock.includes(".insert(") &&
    createFn.includes("organization_id: access.organizationId") &&
    createFn.includes("customer_id: customer.id") &&
    insertBlock.includes('.select("id")') &&
    insertBlock.includes(".single()"),
  "inserted vehicle uses access organization_id + verified customer_id and confirms returned id",
);
assert(
  !createFn.includes("input.organization_id") &&
    !/insertPayload[\s\S]*\bid\s*:/.test(createFn) &&
    !createFn.includes("archived_at:") &&
    !createFn.includes("created_at:") &&
    !createFn.includes("updated_at:"),
  "insert does not accept browser id/org/archive/timestamps",
);

assert(!/service_role/i.test(sliceCSrc), "no service_role");
assert(!/SUPABASE_SERVICE_ROLE/.test(sliceCSrc), "no service role env usage");
assert(!/quibi/i.test(sliceCSrc), "no Quibi");
assert(!/myplanly/i.test(sliceCSrc), "no MyPlanly");
assert(
  !/\.from\("service_requests"\)/.test(createFn) &&
    !/service_request/i.test(createFn),
  "no service_request creation",
);
assert(
  !/\.delete\(/.test(createFn) &&
    !/ownership|transfer|archiveCustomer|archiveVehicle/i.test(createFn),
  "no archive/delete/ownership-transfer logic",
);
assert(
  actionsSrc.includes('from "@/lib/supabase/server"') &&
    createFn.includes("createClient()") &&
    !createUi.includes('.from("vehicles")') &&
    !createUi.includes("createBrowserClient") &&
    !detailUi.includes('.insert('),
  "no browser direct Supabase insert; mutations use publishable server client",
);

assert(
  createFn.includes("isVinUniqueViolation") &&
    createFn.includes("VIN_ALREADY_USED_MESSAGE") &&
    messagesSrc.includes(`"${VIN_ALREADY_USED_MESSAGE}"`),
  "VIN 23505 mapping remains safe",
);
assert(
  isVinUniqueViolation({
    code: "23505",
    message:
      'duplicate key value violates unique constraint "vehicles_organization_id_vin_normalized_unique"',
  }),
  "VIN unique helper recognizes vin constraint",
);
assert(
  !isVinUniqueViolation({ code: "23505", message: "other_unique" }),
  "non-VIN unique error is not mapped as VIN conflict",
);
assert(
  !isVinUniqueViolation({ code: "42501", message: "vin" }),
  "non-unique errors are not VIN conflicts",
);

const badYear = validateVehicleEdit({
  registration: "",
  vin: "",
  make: "",
  model: "",
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
assert(!badFuel.ok && badFuel.fieldErrors.fuel, "fuel validation remains correct");

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
  assert(okVehicle.value.fuel === "petrol", "fuel kept");
}

assert(
  createFn.includes("mileage_latest_recorded_at") &&
    createFn.includes("mileage_latest_km != null") &&
    /if\s*\(\s*validated\.value\.mileage_latest_km\s*!=\s*null\s*\)/.test(
      createFn,
    ) &&
    createFn.includes("new Date().toISOString()"),
  "mileage timestamp is set only when initial mileage exists (server time)",
);
assert(
  !createFn.includes("input.mileage_latest_recorded_at") &&
    !createFn.includes("mileageRecordedAt"),
  "mileage timestamp is not browser-supplied",
);

assert(detailUi.includes("Dodaj vozilo"), 'UI exposes "Dodaj vozilo"');
assert(
  detailUi.includes("Uredi stranko") && detailUi.includes("Uredi vozilo"),
  'Slice B "Uredi stranko" and "Uredi vozilo" remain intact',
);
assert(
  createUi.includes("createCustomerVehicleAction") &&
    createUi.includes("Shrani") &&
    createUi.includes("Prekliči"),
  "create panel calls server action with Save/Cancel",
);
assert(
  customerEditUi.includes("updateCustomerAction") &&
    vehicleEditUi.includes("updateVehicleAction"),
  "Slice B edit panels remain wired",
);

const strankeNav = navigationSrc.match(/id:\s*"customers"[\s\S]*?\n  \},/);
assert(strankeNav, "Stranke nav found");
assert(
  strankeNav![0].includes('href: "/dashboard/stranke"') &&
    strankeNav![0].includes("available: true"),
  "Stranke navigation remains available",
);
assert(sliceAAssert.includes("phase14b-customers-slice-a"), "Slice A assert still present");
assert(
  sliceBAssert.includes("phase14b-customer-vehicle-edit"),
  "Slice B assert still present",
);

const migrations = readdirSync(resolve(process.cwd(), "supabase/migrations"));
assert(
  migrations.every(
    (name) =>
      !name.toLowerCase().includes("phase14b") &&
      !name.toLowerCase().includes("customer_vehicle_create") &&
      !name.toLowerCase().includes("vehicle_create"),
  ),
  "no Slice C migration exists",
);
assert(!/create table/i.test(sliceCSrc), "no DDL in Slice C");

console.log("phase14b-customer-vehicle-create.assert: PASS");
