"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { customerMatchesSearch } from "@/lib/customers/present";
import type { CustomerDirectoryItem } from "@/lib/customers/types";

interface CustomerDirectoryProps {
  customers: CustomerDirectoryItem[];
}

function Dash() {
  return <span className="text-slate-400">—</span>;
}

export function CustomerDirectory({ customers }: CustomerDirectoryProps) {
  const [query, setQuery] = useState("");

  const visible = useMemo(
    () => customers.filter((customer) => customerMatchesSearch(customer, query)),
    [customers, query],
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <label className="sr-only" htmlFor="customer-search">
          Išči po imenu, telefonu ali e-pošti
        </label>
        <input
          id="customer-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Išči po imenu, telefonu ali e-pošti"
          className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
        {customers.length > 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            {query.trim()
              ? `${visible.length} od ${customers.length}`
              : `Število strank: ${customers.length}`}
          </p>
        ) : null}
      </div>

      {customers.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-slate-500">
          Ni strank. V organizaciji še ni aktivnih strank.
        </p>
      ) : visible.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-slate-500">
          Ni strank, ki ustrezajo iskanju.
        </p>
      ) : (
        <>
          <div className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    <th className="px-4 py-2.5 font-semibold">Stranka</th>
                    <th className="px-3 py-2.5 font-semibold">Telefon</th>
                    <th className="px-3 py-2.5 font-semibold">E-pošta</th>
                    <th className="px-3 py-2.5 font-semibold">Tip</th>
                    <th className="px-3 py-2.5 font-semibold">Aktivna vozila</th>
                    <th className="px-3 py-2.5 font-semibold">Zahteve</th>
                    <th className="px-3 py-2.5 font-semibold">Posodobljeno</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((customer) => (
                    <tr
                      key={customer.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/stranke/${customer.id}`}
                          className="font-medium text-blue-700 hover:text-blue-800"
                        >
                          {customer.displayName}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {customer.phone ?? <Dash />}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {customer.email ?? <Dash />}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {customer.customerTypeLabel}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {customer.activeVehicleCount}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {customer.serviceRequestCount}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-slate-500">
                        {customer.lastUpdatedLabel}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <ul className="space-y-2 p-3 md:hidden">
            {visible.map((customer) => (
              <li key={customer.id}>
                <Link
                  href={`/dashboard/stranke/${customer.id}`}
                  className="block rounded-xl border border-slate-200 bg-white p-3 shadow-sm hover:bg-slate-50"
                >
                  <p className="text-sm font-semibold text-slate-900">
                    {customer.displayName}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {customer.phone ?? "Brez telefona"}
                    {customer.email ? ` · ${customer.email}` : ""}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    {customer.customerTypeLabel}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Vozila: {customer.activeVehicleCount}
                    {" · "}
                    Zahteve: {customer.serviceRequestCount}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {customer.lastUpdatedLabel}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
