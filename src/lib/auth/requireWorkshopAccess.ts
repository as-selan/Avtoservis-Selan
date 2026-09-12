import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type WorkshopRole = "owner" | "admin" | "reception" | "mechanic";

export type WorkshopAccess = {
  userId: string;
  organizationId: string;
  role: WorkshopRole;
};

const WORKSHOP_SLUG = "avtoservis-selan";

const ALLOWED_ROLES = new Set<WorkshopRole>([
  "owner",
  "admin",
  "reception",
  "mechanic",
]);

function isWorkshopRole(value: string): value is WorkshopRole {
  return ALLOWED_ROLES.has(value as WorkshopRole);
}

/**
 * Server-only gate for Avtoservis Selan workshop access.
 *
 * 1. Verifies Auth identity via getClaims() (not getSession()).
 * 2. Resolves the org by canonical slug under RLS — active members can see it.
 * 3. Loads the matching active membership for role.
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
    redirect("/dostop-zavrnjen");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("role")
    .eq("organization_id", organization.id)
    .eq("profile_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (membershipError || !membership?.role || !isWorkshopRole(membership.role)) {
    redirect("/dostop-zavrnjen");
  }

  return {
    userId,
    organizationId: organization.id,
    role: membership.role,
  };
}
