/**
 * Phase 14B Slice A — read-only customer directory and detail.
 * Run: npx --yes tsx scripts/phase14b-customers-slice-a.assert.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isAvailableNavActive } from "../src/lib/dashboard/nav-active";
import {
  buildCustomerDirectoryItems,
  canQueryCustomerId,
  customerMatchesSearch,
  customerTypeLabel,
  formatVehicleIdentity,
  fuelLabel,
  normalizePhoneDigits,
} from "../src/lib/customers/present";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const directoryPage = read("src/app/dashboard/stranke/page.tsx");
const detailPage = read("src/app/dashboard/stranke/[customerId]/page.tsx");
const directoryLoader = read("src/lib/customers/load-customer-directory.ts");
const detailLoader = read("src/lib/customers/load-customer-detail.ts");
const navigationSrc = read("src/lib/dashboard/navigation.ts");
const sidebarSrc = read("src/components/layout/AppSidebar.tsx");

const featureFiles = [
  "src/app/dashboard/stranke/page.tsx",
  "src/app/dashboard/stranke/[customerId]/page.tsx",
  "src/lib/customers/load-customer-directory.ts",
  "src/lib/customers/load-customer-detail.ts",
  "src/lib/customers/present.ts",
  "src/lib/customers/types.ts",
  "src/components/customers/CustomerDirectory.tsx",
  "src/components/customers/CustomerDetail.tsx",
];

assert(
  directoryPage.includes("requirePhase1OperationalAccess()"),
  "/dashboard/stranke uses requirePhase1OperationalAccess()",
);
assert(
  detailPage.includes("requirePhase1OperationalAccess()"),
  "/dashboard/stranke/[customerId] uses requirePhase1OperationalAccess()",
);
assert(
  directoryPage.includes("access.organizationId") &&
    !directoryPage.includes("searchParams"),
  "directory organization scope comes from access, not the URL",
);
assert(
  detailPage.includes("access.organizationId") &&
    detailPage.includes("customerId") &&
    !detailPage.includes("searchParams"),
  "detail organization scope comes from access, not the URL",
);
assert(
  !directoryPage.includes("requireWorkshopAccess()") &&
    !detailPage.includes("requireWorkshopAccess()"),
  "customer routes do not use the broader workshop gate",
);

assert(
  directoryLoader.includes('.from("customers")') &&
    directoryLoader.includes('.eq("organization_id", organizationId)') &&
    directoryLoader.includes('.is("archived_at", null)'),
  "directory customers are organization-scoped and exclude archived",
);
assert(
  directoryLoader.includes('.from("vehicles")') &&
    directoryLoader.includes('.is("archived_at", null)'),
  "directory vehicle counts exclude archived vehicles",
);
assert(
  directoryLoader.includes('.from("service_requests")') &&
    directoryLoader.includes('.is("archived_at", null)'),
  "directory service requests exclude archived rows",
);

const detailCustomerQuery = detailLoader.match(
  /\.from\("customers"\)[\s\S]*?\.maybeSingle\(\)/,
);
assert(detailCustomerQuery, "detail customer query found");
assert(
  detailCustomerQuery![0].includes('.eq("id", customerId)') &&
    detailCustomerQuery![0].includes('.eq("organization_id", organizationId)') &&
    detailCustomerQuery![0].includes('.is("archived_at", null)'),
  "customer detail query uses id + organization_id and excludes archived",
);
assert(
  detailLoader.includes('.from("vehicles")') &&
    detailLoader.includes('.eq("customer_id", customerId)') &&
    detailLoader.includes('.is("archived_at", null)'),
  "detail vehicles are this customer and exclude archived",
);
assert(
  detailLoader.includes('.from("service_requests")') &&
    detailLoader.includes('.eq("customer_id", customerId)') &&
    detailLoader.includes('.is("archived_at", null)'),
  "detail service requests are this customer and exclude archived",
);
assert(
  detailLoader.includes('reason: "unavailable"') &&
    !detailLoader.includes("other organization") &&
    !detailPage.includes("drugi organizac"),
  "missing and other-org customers share one unavailable result",
);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const featureSrc = stripComments(featureFiles.map(read).join("\n"));
assert(!/service_role/i.test(featureSrc), "no service role in customer slice");
assert(!/quibi/i.test(featureSrc), "no Quibi integration in customer slice");
assert(!/myplanly/i.test(featureSrc), "no MyPlanly integration in customer slice");
assert(
  !/\.(insert|update|upsert|delete)\(/.test(featureSrc),
  "customer slice is read-only",
);
assert(
  featureSrc.includes('from "@/lib/supabase/server"') &&
    !featureSrc.includes("SUPABASE_SERVICE_ROLE"),
  "loaders use the publishable server client",
);

function navItemBlock(id: string): string {
  const match = navigationSrc.match(
    new RegExp(`id:\\s*"${id}"[\\s\\S]*?\\n  \\},`),
  );
  assert(match, `nav item ${id} found`);
  return match[1] ? match[0] : match[0];
}

const stranke = navItemBlock("customers");
assert(stranke.includes('label: "Stranke"'), "Stranke label");
assert(stranke.includes('href: "/dashboard/stranke"'), "Stranke href");
assert(stranke.includes("available: true"), "Stranke nav enabled");
assert(
  sidebarSrc.includes("isAvailableNavActive"),
  "sidebar uses shared active-nav helper",
);

for (const id of [
  "service-orders",
  "inquiries",
  "appointments",
  "offers",
  "vehicles",
  "activity",
  "integrations",
  "settings",
] as const) {
  const block = navItemBlock(id);
  assert(block.includes("available: false"), `${id} remains unavailable`);
  assert(!block.includes("href:"), `${id} has no href`);
}

assert(
  isAvailableNavActive("/dashboard/stranke", {
    available: true,
    href: "/dashboard/stranke",
  }),
  "Stranke nav active on directory",
);
assert(
  isAvailableNavActive("/dashboard/stranke/abc", {
    available: true,
    href: "/dashboard/stranke",
  }),
  "Stranke nav active on detail",
);
assert(
  !isAvailableNavActive("/dashboard/stranke", {
    available: true,
    href: "/dashboard",
  }),
  "dashboard nav is not active on Stranke",
);
assert(
  !isAvailableNavActive("/dashboard/vozila", {
    available: false,
  }),
  "unavailable nav stays inactive",
);

assert(customerTypeLabel("individual") === "Fizična oseba", "individual label");
assert(customerTypeLabel("business") === "Podjetje", "business label");
assert(fuelLabel("diesel") === "Dizel", "diesel label");
assert(canQueryCustomerId("not-a-uuid") === false, "invalid customer id rejected");
assert(
  canQueryCustomerId("478210e9-a4cd-432f-8ab0-801b398969d4") === true,
  "uuid customer id accepted",
);
assert(
  formatVehicleIdentity({
    registration: "LJ AB-123",
    vin: "WVWZZZ",
    make: "Volkswagen",
    model: "Golf",
    year: 2018,
  }) === "LJ AB-123 · Volkswagen Golf · 2018",
  "vehicle identity",
);

const items = buildCustomerDirectoryItems(
  [
    {
      id: "c1",
      display_name: "Ana Novak",
      phone: "041 123 456",
      email: "ana@example.com",
      customer_type: "individual",
      updated_at: "2026-09-01T10:00:00.000Z",
    },
  ],
  [
    { customer_id: "c1", updated_at: "2026-09-02T10:00:00.000Z" },
    { customer_id: "c1", updated_at: "2026-09-03T10:00:00.000Z" },
    { customer_id: "other", updated_at: "2026-09-04T10:00:00.000Z" },
  ],
  [
    { customer_id: "c1", updated_at: "2026-09-05T10:00:00.000Z" },
    { customer_id: null, updated_at: "2026-09-06T10:00:00.000Z" },
  ],
  new Date("2026-09-22T12:00:00.000Z"),
);
assert(items.length === 1, "directory builder returns the customer");
assert(items[0].activeVehicleCount === 2, "active vehicle count");
assert(
  items[0].serviceRequestCount === 1,
  "service request count ignores null customer",
);
assert(
  !("openServiceRequestCount" in items[0]),
  "openServiceRequestCount renamed away",
);
assert(
  items[0].lastUpdatedAt === "2026-09-05T10:00:00.000Z",
  "last update is the latest related timestamp",
);
assert(customerMatchesSearch(items[0], "ana novak"), "search by name");
assert(customerMatchesSearch(items[0], "041123"), "search by phone ignoring spaces");
assert(
  customerMatchesSearch(items[0], "041-123-456"),
  "search by phone ignoring hyphens",
);
assert(
  customerMatchesSearch(items[0], "041/123456"),
  "search by phone ignoring slashes",
);
assert(
  normalizePhoneDigits("041-123-456") === "041123456",
  "phone digit normalization strips punctuation",
);
assert(customerMatchesSearch(items[0], "ANA@EXAMPLE.COM"), "search by email");
assert(!customerMatchesSearch(items[0], "zzz"), "search miss");

const migrations = readdirSync(resolve(process.cwd(), "supabase/migrations"));
assert(
  migrations.every((name) => !name.toLowerCase().includes("phase14b")),
  "no phase14b migration added",
);
assert(!featureSrc.toLowerCase().includes("create table"), "no DDL in customer slice");

assert(directoryPage.includes("Stranke"), "directory heading copy present");
assert(
  directoryPage.includes("Pregled strank, njihovih vozil in servisnih zahtev."),
  "directory subtitle",
);
assert(
  !directoryPage.includes("odprtih servisnih zahtev"),
  "directory subtitle no longer says open",
);
const directoryUi = read("src/components/customers/CustomerDirectory.tsx");
assert(
  directoryUi.includes("Išči po imenu, telefonu ali e-pošti"),
  "search placeholder",
);
assert(directoryUi.includes(">Zahteve<"), "directory column uses Zahteve");
assert(
  !directoryUi.includes("Odprte zahteve"),
  "directory column no longer says Odprte zahteve",
);
assert(
  directoryUi.includes("serviceRequestCount") &&
    !directoryUi.includes("openServiceRequestCount"),
  "directory uses serviceRequestCount",
);
const detailUi = read("src/components/customers/CustomerDetail.tsx");
assert(
  detailPage.includes("← Nazaj na stranke") &&
    detailUi.includes("← Nazaj na stranke"),
  "back link copy",
);
assert(
  detailUi.includes(
    "Ne-arhivirane zahteve za prevzem in usklajevanje. To ni zgodovina delavnice.",
  ),
  "detail service-request subtitle is truthful",
);
assert(detailUi.includes("Ni servisnih zahtev."), "detail empty state");
assert(
  !detailUi.includes("Odprte zahteve") &&
    !detailUi.includes("Ni odprtih servisnih zahtev."),
  "detail no longer claims requests are open",
);

console.log("phase14b-customers-slice-a.assert: PASS");
