import Link from "next/link";
import { CustomerDetail } from "@/components/customers/CustomerDetail";
import { requirePhase1OperationalAccess } from "@/lib/auth/requireWorkshopAccess";
import { loadCustomerDetail } from "@/lib/customers/load-customer-detail";

export const dynamic = "force-dynamic";

export default async function StrankaDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const access = await requirePhase1OperationalAccess();
  const { customerId } = await params;
  const result = await loadCustomerDetail(access.organizationId, customerId);

  if (!result.ok && result.reason === "unavailable") {
    return (
      <div className="space-y-3">
        <Link
          href="/dashboard/stranke"
          className="text-sm font-medium text-blue-700 hover:text-blue-800"
        >
          ← Nazaj na stranke
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Stranka ni na voljo
        </h1>
        <p className="text-sm text-slate-600">Stranke ni mogoče prikazati.</p>
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div className="space-y-4">
        <Link
          href="/dashboard/stranke"
          className="text-sm font-medium text-blue-700 hover:text-blue-800"
        >
          ← Nazaj na stranke
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Stranka
        </h1>
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-800"
          role="alert"
        >
          {result.message}
        </div>
      </div>
    );
  }

  return <CustomerDetail customer={result.customer} />;
}
