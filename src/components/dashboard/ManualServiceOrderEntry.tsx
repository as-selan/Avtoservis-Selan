"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { FUEL_OPTIONS } from "@/lib/dashboard/demo-data";
import type { FuelType } from "@/lib/dashboard/types";
import { useManualEntry } from "@/components/dashboard/ManualEntryContext";

interface FormState {
  fullName: string;
  email: string;
  phone: string;
  registration: string;
  vin: string;
  make: string;
  model: string;
  year: string;
  mileage: string;
  powerKw: string;
  engineDisplacement: string;
  engineCode: string;
  fuel: FuelType | "";
  serviceWanted: string;
  bringsOwnMaterial: "da" | "ne";
  problemDescription: string;
}

const INITIAL: FormState = {
  fullName: "",
  email: "",
  phone: "",
  registration: "",
  vin: "",
  make: "",
  model: "",
  year: "",
  mileage: "",
  powerKw: "",
  engineDisplacement: "",
  engineCode: "",
  fuel: "",
  serviceWanted: "",
  bringsOwnMaterial: "ne",
  problemDescription: "",
};

export function ManualServiceOrderEntry() {
  const { open, setOpen } = useManualEntry();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>(
    {},
  );
  const [demoNotice, setDemoNotice] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.fullName.trim()) next.fullName = "Obvezno polje";
    if (!form.email.trim()) next.email = "Obvezno polje";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = "Neveljavna e-pošta";
    }
    if (!form.phone.trim()) next.phone = "Obvezno polje";
    if (!form.vin.trim()) next.vin = "Obvezno polje";
    if (!form.make.trim()) next.make = "Obvezno polje";
    if (!form.model.trim()) next.model = "Obvezno polje";
    if (!form.mileage.trim()) next.mileage = "Obvezno polje";
    if (!form.serviceWanted.trim()) next.serviceWanted = "Obvezno polje";
    if (!form.problemDescription.trim()) {
      next.problemDescription = "Obvezno polje";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setDemoNotice(null);
    if (!validate()) return;

    setDemoNotice(
      "Demo način: obrazec je preverjen lokalno. Servisni nalog NI bil ustvarjen v bazi (Supabase še ni povezan).",
    );
  }

  function handleClose() {
    setOpen(false);
    setDemoNotice(null);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/45"
        aria-label="Zapri ozadje"
        onClick={handleClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-entry-title"
        className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:mx-4 sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div>
            <h2
              id="manual-entry-title"
              className="text-base font-semibold text-slate-900"
            >
              Ročni vnos
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Ročni sprejem servisnega naloga. Trenutno samo lokalni demo — brez
              zapisa v bazo.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Zapri"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col"
          noValidate
        >
          <div className="space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
            <fieldset>
              <legend className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Stranka
              </legend>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <Field
                  label="Ime in priimek *"
                  error={errors.fullName}
                  value={form.fullName}
                  onChange={(v) => update("fullName", v)}
                />
                <Field
                  label="E-pošta *"
                  type="email"
                  error={errors.email}
                  value={form.email}
                  onChange={(v) => update("email", v)}
                />
                <Field
                  label="Telefon *"
                  type="tel"
                  error={errors.phone}
                  value={form.phone}
                  onChange={(v) => update("phone", v)}
                />
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Vozilo
              </legend>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <Field
                  label="Registracija"
                  value={form.registration}
                  onChange={(v) => update("registration", v)}
                />
                <Field
                  label="VIN / številka šasije *"
                  error={errors.vin}
                  value={form.vin}
                  onChange={(v) => update("vin", v)}
                />
                <Field
                  label="Znamka *"
                  error={errors.make}
                  value={form.make}
                  onChange={(v) => update("make", v)}
                />
                <Field
                  label="Model *"
                  error={errors.model}
                  value={form.model}
                  onChange={(v) => update("model", v)}
                />
                <Field
                  label="Letnik"
                  value={form.year}
                  onChange={(v) => update("year", v)}
                />
                <Field
                  label="Kilometri *"
                  error={errors.mileage}
                  value={form.mileage}
                  onChange={(v) => update("mileage", v)}
                />
                <Field
                  label="Moč motorja (kW)"
                  value={form.powerKw}
                  onChange={(v) => update("powerKw", v)}
                />
                <Field
                  label="Motor / prostornina"
                  value={form.engineDisplacement}
                  onChange={(v) => update("engineDisplacement", v)}
                />
                <Field
                  label="Tip / koda motorja"
                  value={form.engineCode}
                  onChange={(v) => update("engineCode", v)}
                />
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Vrsta goriva
                  </label>
                  <select
                    value={form.fuel}
                    onChange={(e) =>
                      update("fuel", e.target.value as FuelType | "")
                    }
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="">Izberi...</option>
                    {FUEL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Servis
              </legend>
              <div className="mt-2 grid gap-3">
                <Field
                  label="Storitev / kaj stranka želi *"
                  error={errors.serviceWanted}
                  value={form.serviceWanted}
                  onChange={(v) => update("serviceWanted", v)}
                />
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-600">
                    Stranka prinese svoj material
                  </p>
                  <div className="flex gap-2">
                    {(["da", "ne"] as const).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => update("bringsOwnMaterial", opt)}
                        className={[
                          "min-h-10 flex-1 rounded-lg border px-3 text-sm font-medium",
                          form.bringsOwnMaterial === opt
                            ? "border-blue-600 bg-blue-50 text-blue-700"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50",
                        ].join(" ")}
                      >
                        {opt === "da" ? "Da" : "Ne"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Kaj stranka potrebuje / opis težave *
                  </label>
                  <textarea
                    rows={3}
                    value={form.problemDescription}
                    onChange={(e) =>
                      update("problemDescription", e.target.value)
                    }
                    className={[
                      "w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20",
                      errors.problemDescription
                        ? "border-red-400 focus:border-red-500"
                        : "border-slate-200 focus:border-blue-500",
                    ].join(" ")}
                  />
                  {errors.problemDescription ? (
                    <p className="mt-1 text-xs text-red-600">
                      {errors.problemDescription}
                    </p>
                  ) : null}
                </div>
              </div>
            </fieldset>

            {demoNotice ? (
              <div
                role="status"
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900"
              >
                {demoNotice}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Prekliči
            </button>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Ustvari servisni nalog
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={[
          "h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/20",
          error
            ? "border-red-400 focus:border-red-500"
            : "border-slate-200 focus:border-blue-500",
        ].join(" ")}
      />
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
