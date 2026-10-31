/**
 * Phase 14A V1 — auth/access alignment assertions.
 * Run: npx --yes tsx scripts/phase14a-auth-access.assert.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  initialsFromDisplayName,
  roleLabel,
  shortNameFromDisplayName,
} from "../src/lib/auth/shellUser";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const accessSrc = read("src/lib/auth/requireWorkshopAccess.ts");
const shellUserSrc = read("src/lib/auth/shellUser.ts");
const loadShellUserSrc = read("src/lib/auth/loadDashboardShellUser.ts");
const intakeAccessSrc = read("src/lib/intake/access.ts");
const snapshotSrc = read("src/lib/dashboard/load-dashboard-snapshot.ts");
const navigationSrc = read("src/lib/dashboard/navigation.ts");
const layoutSrc = read("src/app/dashboard/layout.tsx");
const appShellSrc = read("src/components/layout/AppShell.tsx");
const headerSrc = read("src/components/layout/AppHeader.tsx");
const sidebarSrc = read("src/components/layout/AppSidebar.tsx");
const signoutSrc = read("src/app/auth/signout/route.ts");
const deniedSrc = read("src/app/dostop-zavrnjen/page.tsx");

// ---------------------------------------------------------------------------
// A. General workshop membership vs Phase-1 operational access
// ---------------------------------------------------------------------------
const workshopRolesMatch = accessSrc.match(
  /WORKSHOP_ROLES\s*=\s*new Set<[^>]+>\(\[([\s\S]*?)\]\)/,
);
assert(workshopRolesMatch, "WORKSHOP_ROLES set found");
for (const role of ["owner", "admin", "reception", "mechanic"] as const) {
  assert(
    workshopRolesMatch![1].includes(`"${role}"`),
    `requireWorkshopAccess handles ${role}`,
  );
}

assert(
  accessSrc.includes("export async function requireWorkshopAccess"),
  "requireWorkshopAccess exported",
);
assert(
  accessSrc.includes("export async function requirePhase1OperationalAccess"),
  "requirePhase1OperationalAccess exported",
);
assert(
  accessSrc.includes("export function isPhase1OperationalRole"),
  "shared isPhase1OperationalRole predicate exported",
);

const workshopFnMatch = accessSrc.match(
  /export async function requireWorkshopAccess\([\s\S]*?\n\}/,
);
assert(workshopFnMatch, "requireWorkshopAccess function body found");
assert(
  workshopFnMatch![0].includes("auth.getClaims()"),
  "workshop gate uses auth.getClaims()",
);
assert(
  workshopFnMatch![0].includes('redirect("/login")'),
  "no auth identity -> redirect(/login)",
);
assert(
  workshopFnMatch![0].includes('.eq("is_active", true)'),
  "membership query requires is_active = true",
);
assert(
  workshopFnMatch![0].includes('redirect("/dostop-zavrnjen")'),
  "missing/invalid membership -> redirect(/dostop-zavrnjen)",
);

const phase1RolesMatch = accessSrc.match(
  /PHASE1_OPERATIONAL_ROLES\s*=\s*new Set<[^>]+>\(\[([\s\S]*?)\]\)/,
);
assert(phase1RolesMatch, "PHASE1_OPERATIONAL_ROLES set found");
for (const role of ["owner", "admin", "reception"] as const) {
  assert(
    phase1RolesMatch![1].includes(`"${role}"`),
    `${role} in Phase-1 operational roles`,
  );
}
assert(
  !phase1RolesMatch![1].includes('"mechanic"') &&
    !phase1RolesMatch![1].includes("'mechanic'"),
  "mechanic not in Phase-1 operational roles",
);

const phase1FnMatch = accessSrc.match(
  /export async function requirePhase1OperationalAccess\([\s\S]*?\n\}/,
);
assert(phase1FnMatch, "requirePhase1OperationalAccess function body found");
assert(
  phase1FnMatch![0].includes("requireWorkshopAccess()") &&
    phase1FnMatch![0].includes("isPhase1OperationalRole") &&
    phase1FnMatch![0].includes('redirect("/dostop-zavrnjen")'),
  "Phase-1 gate redirects non-phase-1 roles to /dostop-zavrnjen",
);

assert(
  layoutSrc.includes("requirePhase1OperationalAccess") &&
    !layoutSrc.includes("requireWorkshopAccess()"),
  "dashboard layout uses requirePhase1OperationalAccess",
);
assert(
  snapshotSrc.includes("requirePhase1OperationalAccess") &&
    !snapshotSrc.includes("requireWorkshopAccess()"),
  "dashboard snapshot uses requirePhase1OperationalAccess",
);

assert(
  intakeAccessSrc.includes("requireWorkshopAccess()") &&
    intakeAccessSrc.includes("isPhase1OperationalRole"),
  "manual intake uses requireWorkshopAccess + isPhase1OperationalRole",
);
assert(
  !intakeAccessSrc.includes("requirePhase1OperationalAccess"),
  "manual intake DOES NOT call requirePhase1OperationalAccess",
);
assert(
  intakeAccessSrc.includes('errorCode: "forbidden"') &&
    intakeAccessSrc.includes("ok: false") &&
    intakeAccessSrc.includes("!isPhase1OperationalRole"),
  "mechanic manual intake returns forbidden",
);
assert(
  intakeAccessSrc.includes("Phase1OperationalAccess") &&
    !intakeAccessSrc.includes("new Set"),
  "manual intake returns Phase1OperationalAccess without duplicating role set",
);

// ---------------------------------------------------------------------------
// B. Hardcoded Tadej identity absent
// ---------------------------------------------------------------------------
assert(!navigationSrc.includes("CURRENT_USER"), "CURRENT_USER export removed");
assert(!navigationSrc.includes("Tadej Selan"), "hardcoded Tadej Selan absent");
assert(
  !navigationSrc.includes('initials: "T"'),
  "hardcoded initials T absent from navigation",
);
assert(
  !headerSrc.includes("CURRENT_USER") && !sidebarSrc.includes("CURRENT_USER"),
  "shell components do not import CURRENT_USER",
);
assert(
  !headerSrc.includes("Tadej Selan") && !sidebarSrc.includes("Tadej Selan"),
  "shell UI has no hardcoded Tadej Selan",
);

// ---------------------------------------------------------------------------
// C. Real profile/membership identity wired into AppShell
// ---------------------------------------------------------------------------
assert(
  layoutSrc.includes("requirePhase1OperationalAccess") &&
    layoutSrc.includes("loadDashboardShellUser") &&
    layoutSrc.includes("user={user}"),
  "dashboard layout loads shell user server-side",
);
assert(
  appShellSrc.includes("user: DashboardShellUser") &&
    appShellSrc.includes("user={user}"),
  "AppShell accepts and forwards user",
);
assert(
  headerSrc.includes("user.displayName") ||
    headerSrc.includes("user.initials") ||
    headerSrc.includes("user.role"),
  "AppHeader uses user identity props",
);
assert(
  sidebarSrc.includes("user.displayName") &&
    sidebarSrc.includes("user.initials") &&
    sidebarSrc.includes("user.role"),
  "AppSidebar uses user identity props",
);
assert(
  shellUserSrc.includes("export function roleLabel") &&
    shellUserSrc.includes("export function initialsFromDisplayName"),
  "client-safe shell identity helpers exported",
);
assert(
  loadShellUserSrc.includes('from("profiles")') &&
    loadShellUserSrc.includes("full_name") &&
    loadShellUserSrc.includes("email"),
  "shell user reads profiles full_name/email",
);

assert(roleLabel("owner") === "Lastnik", "owner label");
assert(roleLabel("admin") === "Administrator", "admin label");
assert(roleLabel("reception") === "Recepcija", "reception label");
assert(initialsFromDisplayName("Ana Novak") === "AN", "initials from full name");
assert(shortNameFromDisplayName("Ana Novak") === "Ana", "short name from display");

// ---------------------------------------------------------------------------
// D. Logout is POST /auth/signout
// ---------------------------------------------------------------------------
assert(
  signoutSrc.includes("export async function POST") &&
    !signoutSrc.includes("export async function GET"),
  "signout route is POST-only",
);
assert(
  sidebarSrc.includes('action="/auth/signout"') &&
    sidebarSrc.includes('method="post"'),
  "sidebar logout is POST /auth/signout",
);
assert(
  deniedSrc.includes('action="/auth/signout"') &&
    deniedSrc.includes('method="post"'),
  "access-denied logout is POST /auth/signout",
);
assert(
  !sidebarSrc.includes('href="/auth/signout"') &&
    !sidebarSrc.includes('href="/logout"'),
  "no GET logout link in sidebar",
);

console.log("phase14a-auth-access.assert: PASS");
