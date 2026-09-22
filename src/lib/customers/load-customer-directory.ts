import { createClient } from "@/lib/supabase/server";
import {
  buildCustomerDirectoryItems,
  type DirectoryCustomerSource,
  type DirectoryRelatedSource,
} from "@/lib/customers/present";
import type { CustomerDirectoryResult } from "@/lib/customers/types";

const LOAD_ERROR_MESSAGE =
  "Strank trenutno ni mogoče naložiti. Poskusite znova kasneje.";

/**
 * Active customers for one organization.
 * organizationId must come from requirePhase1OperationalAccess() — never from the URL.
 * Uses the publishable cookie client only (no service_role).
 * Archived customers, vehicles, and service requests are excluded.
 * Service-request counts are non-archived intake rows, not workshop history.
 */
export async function loadCustomerDirectory(
  organizationId: string,
): Promise<CustomerDirectoryResult> {
  const now = new Date();

  try {
    const supabase = await createClient();

    const { data: customerRows, error: customerError } = await supabase
      .from("customers")
      .select("id, display_name, phone, email, customer_type, updated_at")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("display_name", { ascending: true });

    if (customerError) {
      return { ok: false, message: LOAD_ERROR_MESSAGE };
    }

    const customers = (customerRows ?? []) as unknown as DirectoryCustomerSource[];
    if (customers.length === 0) {
      return { ok: true, customers: [] };
    }

    const [{ data: vehicleRows, error: vehicleError }, { data: requestRows, error: requestError }] =
      await Promise.all([
        supabase
          .from("vehicles")
          .select("customer_id, updated_at")
          .eq("organization_id", organizationId)
          .is("archived_at", null),
        supabase
          .from("service_requests")
          .select("customer_id, updated_at")
          .eq("organization_id", organizationId)
          .is("archived_at", null),
      ]);

    if (vehicleError || requestError) {
      return { ok: false, message: LOAD_ERROR_MESSAGE };
    }

    return {
      ok: true,
      customers: buildCustomerDirectoryItems(
        customers,
        (vehicleRows ?? []) as unknown as DirectoryRelatedSource[],
        (requestRows ?? []) as unknown as DirectoryRelatedSource[],
        now,
      ),
    };
  } catch {
    return { ok: false, message: LOAD_ERROR_MESSAGE };
  }
}
