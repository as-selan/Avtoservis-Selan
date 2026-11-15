import type {
  Phase1OperationalAccess,
  WorkshopAccess,
} from "@/lib/auth/requireWorkshopAccess";
import {
  isPhase1OperationalRole,
  requireWorkshopAccess,
} from "@/lib/auth/requireWorkshopAccess";

/**
 * Fail-closed gate for manual intake (mechanic excluded).
 * Uses requireWorkshopAccess() + shared isPhase1OperationalRole().
 * Returns { ok: false, errorCode: "forbidden" } for mechanic — does not redirect.
 */
export async function requireManualIntakeAccess(): Promise<
  | { ok: true; access: Phase1OperationalAccess }
  | { ok: false; errorCode: "forbidden" }
> {
  const access: WorkshopAccess = await requireWorkshopAccess();
  if (!isPhase1OperationalRole(access.role)) {
    return { ok: false, errorCode: "forbidden" };
  }
  const phase1Access: Phase1OperationalAccess = {
    userId: access.userId,
    organizationId: access.organizationId,
    role: access.role,
  };
  return { ok: true, access: phase1Access };
}
