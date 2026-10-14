import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { accessLookupFailure } from "./access-lookup-failure";

/** Membership role values that exist in the schema (including deferred mechanic). */
export type WorkshopRole = "owner" | "admin" | "reception" | "mechanic";

/** Phase-1 operational roles allowed into dashboard / intake surfaces. */
export type Phase1OperationalRole = "owner" | "admin" | "reception";

export type WorkshopAccess = {
  userId: string;
  organizationId: string;
  role: WorkshopRole;
};

export type Phase1OperationalAccess = {
  userId: string;
  organizationId: string;
  role: Phase1OperationalRole;
};

const WORKSHOP_SLUG = "avtoservis-selan";
function resolveLookupFailure(error:{code?:string}|null, found:boolean):never {
  const failure=accessLookupFailure(error,found);
  if(failure==='reauthenticate') redirect('/login?reason=session');
  if(failure==='unavailable') throw new Error('WORKSHOP_ACCESS_TEMPORARILY_UNAVAILABLE');
  redirect('/dostop-zavrnjen');
}

const WORKSHOP_ROLES = new Set<WorkshopRole>([
  "owner",
  "admin",
  "reception",
  "mechanic",
]);

const PHASE1_OPERATIONAL_ROLES = new Set<Phase1OperationalRole>([
  "owner",
  "admin",
  "reception",
]);

function isWorkshopRole(value: string): value is WorkshopRole {
  return WORKSHOP_ROLES.has(value as WorkshopRole);
}

export function isPhase1OperationalRole(
  value: string,
): value is Phase1OperationalRole {
  return PHASE1_OPERATIONAL_ROLES.has(value as Phase1OperationalRole);
}

/**
 * Server-only gate for Avtoservis Selan workshop membership.
 *
 * 1. Verifies Auth identity via getClaims() (not getSession()).
 * 2. Resolves the org by canonical slug under RLS — active members can see it.
 * 3. Loads the matching active membership for role.
 *
 * Recognizes all active workshop roles, including mechanic.
 * Phase-1 operational surfaces must use requirePhase1OperationalAccess().
 *
 * No organization UUID is hardcoded. Membership writes remain server-trusted elsewhere.
 */
export async function requireWorkshopAccess(): Promise<WorkshopAccess> {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  const userId = typeof claims?.sub === "string" ? claims.sub : null;

  if (!userId) {
    redirect("/login");
  }

  const { data: organization, error: orgError } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", WORKSHOP_SLUG)
    .maybeSingle();

  if (orgError || !organization?.id) {
    console.error('WORKSHOP_ACCESS_LOOKUP', {stage:'organization', code:orgError?.code?.replace(/[^A-Za-z0-9_]/g,'').slice(0,40)??'no_row'});
    resolveLookupFailure(orgError, Boolean(organization?.id));
  }

  let { data: membership, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("role")
    .eq("organization_id", organization.id)
    .eq("profile_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if(!membershipError&&!membership){const accepted=await supabase.rpc('accept_team_invitation');if(!accepted.error&&accepted.data===true){const lookup=await supabase.from('organization_memberships').select('role').eq('organization_id',organization.id).eq('profile_id',userId).eq('is_active',true).maybeSingle();membership=lookup.data;membershipError=lookup.error;}}
  if (membershipError || !membership?.role || !isWorkshopRole(membership.role)) {
    console.error('WORKSHOP_ACCESS_LOOKUP', {stage:'membership', code:membershipError?.code?.replace(/[^A-Za-z0-9_]/g,'').slice(0,40)??'no_active_role'});
    resolveLookupFailure(membershipError, Boolean(membership?.role && isWorkshopRole(membership.role)));
  }

  return {
    userId,
    organizationId: organization.id,
    role: membership.role,
  };
}

/**
 * Phase-1 operational gate (dashboard shell / dashboard data).
 * Builds on requireWorkshopAccess(), then allows only owner / admin / reception.
 * Mechanic (and any non-phase-1 role) redirects to /dostop-zavrnjen.
 * Manual intake uses requireManualIntakeAccess() (forbidden, not redirect).
 */
export async function requirePhase1OperationalAccess(): Promise<Phase1OperationalAccess> {
  const access = await requireWorkshopAccess();

  if (!isPhase1OperationalRole(access.role)) {
    redirect("/dostop-zavrnjen");
  }

  return {
    userId: access.userId,
    organizationId: access.organizationId,
    role: access.role,
  };
}
