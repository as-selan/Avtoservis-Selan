import { CustomerDirectory } from "@/components/customers/CustomerDirectory";
import { requirePhase1OperationalAccess } from "@/lib/auth/requireWorkshopAccess";
import { loadCustomerDirectory } from "@/lib/customers/load-customer-directory";

export const dynamic = "force-dynamic";

export default async function StrankePage() {
  const access = await requirePhase1OperationalAccess();
  const result = await loadCustomerDirectory(access.organizationId);

  return (
    <div className="space-y-4 lg:space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          Stranke
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Pregled strank, njihovih vozil in servisnih zahtev.
        </p>
      </div>

      {result.ok ? (
        <CustomerDirectory customers={result.customers} />
      ) : (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-800"
          role="alert"
        >
          {result.message}
        </div>
      )}
    </div>
  );
}
