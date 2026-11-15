import type { Phase1OperationalRole } from "@/lib/auth/requireWorkshopAccess";
import { createClient } from "@/lib/supabase/server";
import {
  initialsFromDisplayName,
  roleLabel,
  type DashboardShellUser,
} from "@/lib/auth/shellUser";

/**
 * Resolves header/sidebar identity from profiles + membership role.
 * Call only after requirePhase1OperationalAccess() has succeeded.
 */
export async function loadDashboardShellUser(
  userId: string,
  role: Phase1OperationalRole,
): Promise<DashboardShellUser> {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();

  const fullName =
    typeof profile?.full_name === "string" ? profile.full_name.trim() : "";
  const email = typeof profile?.email === "string" ? profile.email.trim() : "";
  const displayName = fullName || email || "Uporabnik";

  return {
    displayName,
    role: roleLabel(role),
    initials: initialsFromDisplayName(displayName),
  };
}
