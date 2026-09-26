import type { WorkshopAccess, WorkshopRole } from "@/lib/auth/requireWorkshopAccess";
import { requireWorkshopAccess } from "@/lib/auth/requireWorkshopAccess";

const MANUAL_INTAKE_ROLES = new Set<WorkshopRole>([
  "owner",
  "admin",
  "reception",
]);

/**
 * Fail-closed gate for manual intake (mechanic excluded).
 * Uses the same org resolution as dashboard access, then restricts roles.
 */
export async function requireManualIntakeAccess(): Promise<
  | { ok: true; access: WorkshopAccess }
  | { ok: false; errorCode: "forbidden" }
> {
  const access = await requireWorkshopAccess();
  if (!MANUAL_INTAKE_ROLES.has(access.role)) {
    return { ok: false, errorCode: "forbidden" };
  }
  return { ok: true, access };
}
