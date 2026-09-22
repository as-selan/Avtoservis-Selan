"use client";

import { useState } from "react";
import Link from "next/link";
import { toPresentationRef } from "@/lib/dashboard/adapt-dashboard";
import { CustomerEditPanel } from "@/components/customers/CustomerEditPanel";
import { VehicleEditPanel } from "@/components/customers/VehicleEditPanel";
import type {
  CustomerDetailView,
  CustomerServiceRequestView,
  CustomerVehicleView,
} from "@/lib/customers/types";

function Dash() {
  return <span className="text-slate-400">—</span>;
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-slate-800">{value ?? <Dash />}</dd>
    </div>
  );
}

function VehicleCard({
  customerId,
  vehicle,
  onSaved,
}: {
  customerId: string;
  vehicle: CustomerVehicleView;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">
          {[vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vozilo"}
          {vehicle.year != null ? ` · ${vehicle.year}` : ""}
        </p>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Uredi vozilo
          </button>
        ) : null}
      </div>
      {!editing ? (
        <dl className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Registracija" value={vehicle.registration} />
          <Field label="VIN" value={vehicle.vin} />
          <Field label="Gorivo" value={vehicle.fuelLabel} />
          <Field label="Kilometri" value={vehicle.mileageLabel} />
        </dl>
      ) : (
        <VehicleEditPanel
          customerId={customerId}
          vehicle={vehicle}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onSaved();
          }}
        />
      )}
    </article>
  );
}

function RequestCard({ request }: { request: CustomerServiceRequestView }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">
          #{toPresentationRef(request.id)}
        </p>
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${request.statusBadgeClass}`}
        >
          {request.statusLabel}
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-700">{request.summary}</p>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Naslednji korak" value={request.nextAction} />
        <Field label="Vozilo" value={request.vehicleLabel} />
      </dl>
      {request.hasError || request.attentionNeeded ? (
        <div className="mt-3 space-y-1">
          {request.hasError ? (
            <p className="text-sm text-red-700">
              Napaka{request.errorReason ? `: ${request.errorReason}` : ""}
            </p>
          ) : null}
          {request.attentionNeeded ? (
            <p className="text-sm text-amber-800">
              Pozornost
              {request.attentionReason ? `: ${request.attentionReason}` : ""}
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="mt-3 text-xs text-slate-500">{request.updatedLabel}</p>
    </article>
  );
}

export function CustomerDetail({ customer }: { customer: CustomerDetailView }) {
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  return (
    <div className="space-y-4 lg:space-y-5">
      <div>
        <Link
          href="/dashboard/stranke"
          className="text-sm font-medium text-blue-700 hover:text-blue-800"
        >
          ← Nazaj na stranke
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          {customer.displayName}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {customer.customerTypeLabel}
        </p>
        {saveNotice ? (
          <p className="mt-2 text-sm text-emerald-700" role="status">
            {saveNotice}
          </p>
        ) : null}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Stranka</h2>
          {!editingCustomer ? (
            <button
              type="button"
              onClick={() => {
                setSaveNotice(null);
                setEditingCustomer(true);
              }}
              className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Uredi stranko
            </button>
          ) : null}
        </div>
        {!editingCustomer ? (
          <>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Telefon" value={customer.phone} />
              <Field label="E-pošta" value={customer.email} />
              <Field label="Tip" value={customer.customerTypeLabel} />
            </dl>
            {customer.notes ? (
              <div className="mt-4">
                <h3 className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                  Opombe
                </h3>
                <p className="mt-1 text-sm whitespace-pre-wrap text-slate-800">
                  {customer.notes}
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <CustomerEditPanel
            customer={customer}
            onCancel={() => setEditingCustomer(false)}
            onSaved={() => {
              setEditingCustomer(false);
              setSaveNotice("Spremembe stranke so shranjene.");
            }}
          />
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Vozila</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Aktivna vozila v lasti te stranke.
          </p>
        </div>
        {customer.vehicles.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
            Ni aktivnih vozil.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {customer.vehicles.map((vehicle) => (
              <VehicleCard
                key={vehicle.id}
                customerId={customer.id}
                vehicle={vehicle}
                onSaved={() =>
                  setSaveNotice("Spremembe vozila so shranjene.")
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Servisne zahteve
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Ne-arhivirane zahteve za prevzem in usklajevanje. To ni zgodovina delavnice.
          </p>
        </div>
        {customer.serviceRequests.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
            Ni servisnih zahtev.
          </p>
        ) : (
          <div className="space-y-3">
            {customer.serviceRequests.map((request) => (
              <RequestCard key={request.id} request={request} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
