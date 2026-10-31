"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CUSTOMER_VEHICLE_EDIT_GENERIC_ERROR,
} from "@/lib/customers/edit-messages";
import { updateVehicleAction } from "@/lib/customers/actions";
import { VEHICLE_FUEL_OPTIONS } from "@/lib/customers/present";
import type { CustomerVehicleView } from "@/lib/customers/types";

const inputClass =
  "mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";
const labelClass = "block text-xs font-medium tracking-wide text-slate-500 uppercase";

export function VehicleEditPanel({
  customerId,
  vehicle,
  onCancel,
  onSaved,
}: {
  customerId: string;
  vehicle: CustomerVehicleView;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [registration, setRegistration] = useState(vehicle.registration ?? "");
  const [vin, setVin] = useState(vehicle.vin ?? "");
  const [make, setMake] = useState(vehicle.make ?? "");
  const [model, setModel] = useState(vehicle.model ?? "");
  const [year, setYear] = useState(
    vehicle.year != null ? String(vehicle.year) : "",
  );
  const [powerKw, setPowerKw] = useState(
    vehicle.powerKw != null ? String(vehicle.powerKw) : "",
  );
  const [engine, setEngine] = useState(vehicle.engine ?? "");
  const [engineType, setEngineType] = useState(vehicle.engineType ?? "");
  const [fuel, setFuel] = useState(vehicle.fuel ?? "");
  const [notes, setNotes] = useState(vehicle.notes ?? "");
  const [mileage, setMileage] = useState(
    vehicle.mileageLatestKm != null ? String(vehicle.mileageLatestKm) : "",
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);

    startTransition(async () => {
      try {
        const result = await updateVehicleAction({
          customerId,
          vehicleId: vehicle.id,
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
        router.refresh();
        onSaved();
      } catch {
        setFormError(CUSTOMER_VEHICLE_EDIT_GENERIC_ERROR);
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 space-y-3 border-t border-slate-100 pt-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor={`edit-reg-${vehicle.id}`}>
            Registracija
          </label>
          <input
            id={`edit-reg-${vehicle.id}`}
            value={registration}
            onChange={(e) => setRegistration(e.target.value)}
            className={inputClass}
            disabled={pending}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor={`edit-vin-${vehicle.id}`}>
            VIN
          </label>
          <input
            id={`edit-vin-${vehicle.id}`}
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
          <label className={labelClass} htmlFor={`edit-make-${vehicle.id}`}>
            Znamka
          </label>
          <input
            id={`edit-make-${vehicle.id}`}
            value={make}
            onChange={(e) => setMake(e.target.value)}
            className={inputClass}
            disabled={pending}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor={`edit-model-${vehicle.id}`}>
            Model
          </label>
          <input
            id={`edit-model-${vehicle.id}`}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className={inputClass}
            disabled={pending}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor={`edit-year-${vehicle.id}`}>
            Letnik
          </label>
          <input
            id={`edit-year-${vehicle.id}`}
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
          <label className={labelClass} htmlFor={`edit-power-${vehicle.id}`}>
            Moč (kW)
          </label>
          <input
            id={`edit-power-${vehicle.id}`}
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
          <label className={labelClass} htmlFor={`edit-engine-${vehicle.id}`}>
            Motor
          </label>
          <input
            id={`edit-engine-${vehicle.id}`}
            value={engine}
            onChange={(e) => setEngine(e.target.value)}
            className={inputClass}
            disabled={pending}
          />
        </div>
        <div>
          <label
            className={labelClass}
            htmlFor={`edit-engine-type-${vehicle.id}`}
          >
            Tip motorja
          </label>
          <input
            id={`edit-engine-type-${vehicle.id}`}
            value={engineType}
            onChange={(e) => setEngineType(e.target.value)}
            className={inputClass}
            disabled={pending}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor={`edit-fuel-${vehicle.id}`}>
            Gorivo
          </label>
          <select
            id={`edit-fuel-${vehicle.id}`}
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
          <label className={labelClass} htmlFor={`edit-mileage-${vehicle.id}`}>
            Kilometri
          </label>
          <input
            id={`edit-mileage-${vehicle.id}`}
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
      <div>
        <label className={labelClass} htmlFor={`edit-vnotes-${vehicle.id}`}>
          Opombe
        </label>
        <textarea
          id={`edit-vnotes-${vehicle.id}`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          disabled={pending}
        />
      </div>

      {formError ? (
        <p className="text-sm text-red-700" role="alert">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
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
