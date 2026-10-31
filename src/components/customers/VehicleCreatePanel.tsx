"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CUSTOMER_VEHICLE_EDIT_GENERIC_ERROR,
} from "@/lib/customers/edit-messages";
import { createCustomerVehicleAction } from "@/lib/customers/actions";
import { VEHICLE_FUEL_OPTIONS } from "@/lib/customers/present";

const inputClass =
  "mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";
const labelClass =
  "block text-xs font-medium tracking-wide text-slate-500 uppercase";

export function VehicleCreatePanel({
  customerId,
  onCancel,
  onCreated,
}: {
  customerId: string;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [registration, setRegistration] = useState("");
  const [vin, setVin] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [powerKw, setPowerKw] = useState("");
  const [engine, setEngine] = useState("");
  const [engineType, setEngineType] = useState("");
  const [fuel, setFuel] = useState("");
  const [notes, setNotes] = useState("");
  const [mileage, setMileage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function resetForm() {
    setRegistration("");
    setVin("");
    setMake("");
    setModel("");
    setYear("");
    setPowerKw("");
    setEngine("");
    setEngineType("");
    setFuel("");
    setNotes("");
    setMileage("");
    setFieldErrors({});
    setFormError(null);
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);

    startTransition(async () => {
      try {
        const result = await createCustomerVehicleAction({
          customerId,
          registration,
          vin,
          make,
          model,
          year,
          powerKw,
          engine,
          engineType,
          fuel,
          notes,
          mileage,
        });
        if (!result.ok) {
          if (result.fieldErrors) setFieldErrors(result.fieldErrors);
          setFormError(result.message ?? null);
          return;
        }
        resetForm();
        router.refresh();
        onCreated();
      } catch {
        setFormError(CUSTOMER_VEHICLE_EDIT_GENERIC_ERROR);
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-slate-900">Novo vozilo</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="create-reg">
            Registracija
          </label>
          <input
            id="create-reg"
            value={registration}
            onChange={(e) => setRegistration(e.target.value)}
            className={inputClass}
            disabled={pending}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="create-vin">
            VIN
          </label>
          <input
            id="create-vin"
            value={vin}
            onChange={(e) => setVin(e.target.value)}
            className={inputClass}
            disabled={pending}
          />
          {fieldErrors.vin ? (
            <p className="mt-1 text-xs text-red-700">{fieldErrors.vin}</p>
          ) : null}
        </div>
        <div>
          <label className={labelClass} htmlFor="create-make">
            Znamka
          </label>
          <input
            id="create-make"
            value={make}
            onChange={(e) => setMake(e.target.value)}
            className={inputClass}
            disabled={pending}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="create-model">
            Model
          </label>
          <input
            id="create-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className={inputClass}
            disabled={pending}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="create-year">
            Letnik
          </label>
          <input
            id="create-year"
            inputMode="numeric"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className={inputClass}
            disabled={pending}
          />
          {fieldErrors.year ? (
            <p className="mt-1 text-xs text-red-700">{fieldErrors.year}</p>
          ) : null}
        </div>
        <div>
          <label className={labelClass} htmlFor="create-power">
            Moč (kW)
          </label>
          <input
            id="create-power"
            inputMode="numeric"
            value={powerKw}
            onChange={(e) => setPowerKw(e.target.value)}
            className={inputClass}
            disabled={pending}
          />
          {fieldErrors.powerKw ? (
            <p className="mt-1 text-xs text-red-700">{fieldErrors.powerKw}</p>
          ) : null}
        </div>
        <div>
          <label className={labelClass} htmlFor="create-engine">
            Motor
          </label>
          <input
            id="create-engine"
            value={engine}
            onChange={(e) => setEngine(e.target.value)}
            className={inputClass}
            disabled={pending}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="create-engine-type">
            Tip motorja
          </label>
          <input
            id="create-engine-type"
            value={engineType}
            onChange={(e) => setEngineType(e.target.value)}
            className={inputClass}
            disabled={pending}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="create-fuel">
            Gorivo
          </label>
          <select
            id="create-fuel"
            value={fuel}
            onChange={(e) => setFuel(e.target.value)}
            className={inputClass}
            disabled={pending}
          >
            <option value="">—</option>
            {VEHICLE_FUEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {fieldErrors.fuel ? (
            <p className="mt-1 text-xs text-red-700">{fieldErrors.fuel}</p>
          ) : null}
        </div>
        <div>
          <label className={labelClass} htmlFor="create-mileage">
            Kilometri
          </label>
          <input
            id="create-mileage"
            inputMode="numeric"
            value={mileage}
            onChange={(e) => setMileage(e.target.value)}
            className={inputClass}
            disabled={pending}
          />
          {fieldErrors.mileage ? (
            <p className="mt-1 text-xs text-red-700">{fieldErrors.mileage}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-3">
        <label className={labelClass} htmlFor="create-vnotes">
          Opombe
        </label>
        <textarea
          id="create-vnotes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          disabled={pending}
        />
      </div>

      {formError ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {formError}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? "Shranjujem…" : "Shrani"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          Prekliči
        </button>
      </div>
    </form>
  );
}
