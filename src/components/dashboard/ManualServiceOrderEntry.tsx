"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { FUEL_OPTIONS } from "@/lib/dashboard/demo-data";
import type { FuelType } from "@/lib/dashboard/types";
import { useManualEntry } from "@/components/dashboard/ManualEntryContext";
import {
  createManualServiceRequestIntakeAction,
  searchManualIntakeCandidatesAction,
} from "@/lib/intake/actions";
import { mapUiFuelToDb } from "@/lib/intake/fuel";
import type {
  IntakeCustomerCandidate,
  ManualIntakeChannel,
} from "@/lib/intake/types";

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
  channel: ManualIntakeChannel;
  searchQuery: string;
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
  channel: "phone",
  searchQuery: "",
};

type FieldKey = keyof FormState;

export function ManualServiceOrderEntry() {
  const { open, setOpen } = useManualEntry();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<IntakeCustomerCandidate[]>([]);
  const [selectedCustomer, setSelectedCustomer] =
    useState<IntakeCustomerCandidate | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    null,
  );
  const [searchPending, startSearchTransition] = useTransition();
  const [submitPending, startSubmitTransition] = useTransition();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);
  const clientRequestIdRef = useRef<string | null>(null);

  function ensureClientRequestId(): string {
    if (!clientRequestIdRef.current) {
      clientRequestIdRef.current = crypto.randomUUID();
    }
    return clientRequestIdRef.current;
  }

  function rotateClientRequestId() {
    clientRequestIdRef.current = crypto.randomUUID();
  }

  function update<K extends FieldKey>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateSearchQuery(value: string) {
    update("searchQuery", value);
    if (value.trim().length < 3) {
      searchSeqRef.current += 1;
      setCandidates([]);
    }
  }

  function resetLocalState(opts?: { rotateRequestId?: boolean }) {
    setForm(INITIAL);
    setErrors({});
    setFormError(null);
    setSuccessMessage(null);
    setCandidates([]);
    setSelectedCustomer(null);
    setSelectedVehicleId(null);
    searchSeqRef.current += 1;
    if (opts?.rotateRequestId) {
      rotateClientRequestId();
    } else {
      clientRequestIdRef.current = null;
    }
  }

  function handleClose() {
    if (submitPending) return;
    setOpen(false);
    resetLocalState();
  }

  useEffect(() => {
    if (open) {
      ensureClientRequestId();
    }
  }, [open]);

  function selectCustomer(candidate: IntakeCustomerCandidate) {
    setSelectedCustomer(candidate);
    setSelectedVehicleId(null);
    update("fullName", candidate.displayName);
    update("phone", candidate.phone ?? "");
    update("email", candidate.email ?? "");
    setFormError(null);
  }

  function clearCustomerSelection() {
    setSelectedCustomer(null);
    setSelectedVehicleId(null);
  }

  function selectVehicle(
    customer: IntakeCustomerCandidate,
    vehicleId: string,
  ) {
    if (selectedCustomer?.customerId !== customer.customerId) {
      selectCustomer(customer);
    } else {
      setSelectedCustomer(customer);
    }
    const vehicle = customer.vehicles.find((v) => v.vehicleId === vehicleId);
    setSelectedVehicleId(vehicleId);
    if (vehicle) {
      update("make", vehicle.make ?? "");
      update("model", vehicle.model ?? "");
      update("registration", vehicle.registrationCurrent ?? "");
      update("vin", vehicle.vin ?? "");
    }
  }

  useEffect(() => {
    if (!open) return;
    const q = form.searchQuery.trim();
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.length < 3) return;

    const seq = ++searchSeqRef.current;

    searchTimer.current = setTimeout(() => {
      startSearchTransition(async () => {
        const result = await searchManualIntakeCandidatesAction(q);
        if (seq !== searchSeqRef.current) return;
        if (!result.ok) {
          setCandidates([]);
          setFormError(result.message);
          return;
        }
        setFormError(null);
        setCandidates(result.candidates);
      });
    }, 300);

    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [form.searchQuery, open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitPending) return;

    setErrors({});
    setFormError(null);
    setSuccessMessage(null);

    startSubmitTransition(async () => {
      const result = await createManualServiceRequestIntakeAction({
        displayName: form.fullName,
        phone: form.phone,
        email: form.email,
        channel: form.channel,
        vin: form.vin,
        registration: form.registration,
        make: form.make,
        model: form.model,
        year: form.year,
        powerKw: form.powerKw,
        engine: form.engineDisplacement,
        engineType: form.engineCode,
        fuel: mapUiFuelToDb(form.fuel) ?? "",
        mileage: form.mileage,
        serviceWanted: form.serviceWanted,
        problemDescription: form.problemDescription,
        bringsOwnMaterial: form.bringsOwnMaterial === "da",
        selectedCustomerId: selectedCustomer?.customerId ?? null,
        selectedVehicleId,
        clientRequestId: ensureClientRequestId(),
      });

      if (!result.ok) {
        if (result.fieldErrors) {
          const mapped: Partial<Record<FieldKey, string>> = {};
          for (const [key, message] of Object.entries(result.fieldErrors)) {
            if (key in INITIAL) mapped[key as FieldKey] = message;
          }
          setErrors(mapped);
        }
        setFormError(result.message);
        return;
      }

      resetLocalState({ rotateRequestId: true });
      setSuccessMessage(result.message);
    });
  }

  if (!open) return null;

  const visibleCandidates =
    form.searchQuery.trim().length >= 3 ? candidates : [];

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/45"
        aria-label="Zapri ozadje"
        onClick={handleClose}
        disabled={submitPending}
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
              Ročni sprejem povpraševanja (telefon / SMS / osebno). Išči obstoječo
              stranko, nato shrani eno zahtevo.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            aria-label="Zapri"
            disabled={submitPending}
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
                Iskanje stranke
              </legend>
              <p className="mt-1 text-xs text-slate-500">
                Iskanje po imenu, telefonu, e-pošti, registraciji ali VIN. Ime ni
                samodejna identifikacija — stranko izberite ročno.
              </p>
              <div className="mt-2">
                <Field
                  label="Iskanje"
                  value={form.searchQuery}
                  onChange={updateSearchQuery}
                />
              </div>
              {searchPending ? (
                <p className="mt-2 text-xs text-slate-500">Iščem…</p>
              ) : null}
              {visibleCandidates.length > 0 ? (
                <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {visibleCandidates.map((c) => {
                    const isSelected =
                      selectedCustomer?.customerId === c.customerId;
                    return (
                      <li
                        key={c.customerId}
                        className={[
                          "rounded-lg border px-3 py-2 text-sm",
                          isSelected
                            ? "border-blue-600 bg-blue-50"
                            : "border-slate-200",
                        ].join(" ")}
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => selectCustomer(c)}
                        >
                          <span className="font-medium text-slate-900">
                            {c.displayName}
                          </span>
                          <span className="mt-0.5 block text-xs text-slate-600">
                            {[c.phone, c.email].filter(Boolean).join(" · ") ||
                              "Brez kontakta"}
                          </span>
                        </button>
                        {c.vehicles.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {c.vehicles.map((v) => {
                              const label = [
                                [v.make, v.model].filter(Boolean).join(" "),
                                v.registrationCurrent,
                              ]
                                .filter(Boolean)
                                .join(" · ");
                              const vehicleSelected =
                                selectedVehicleId === v.vehicleId;
                              return (
                                <button
                                  key={v.vehicleId}
                                  type="button"
                                  onClick={() => selectVehicle(c, v.vehicleId)}
                                  className={[
                                    "rounded-md border px-2 py-1 text-xs",
                                    vehicleSelected
                                      ? "border-blue-600 bg-white text-blue-700"
                                      : "border-slate-200 text-slate-600 hover:bg-slate-50",
                                  ].join(" ")}
                                >
                                  {label || "Vozilo"}
                                  {v.vin ? ` · VIN ${v.vin}` : ""}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {selectedCustomer ? (
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-600">
                  <span>
                    Izbrana stranka: {selectedCustomer.displayName}
                    {selectedVehicleId ? " · izbrano vozilo" : ""}
                  </span>
                  <button
                    type="button"
                    className="font-medium text-blue-700 hover:underline"
                    onClick={clearCustomerSelection}
                  >
                    Počisti izbiro
                  </button>
                </div>
              ) : null}
            </fieldset>

            <fieldset>
              <legend className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Kanal
              </legend>
              <div className="mt-2 flex gap-2">
                {(
                  [
                    ["phone", "Telefon"],
                    ["sms", "SMS"],
                    ["manual", "Osebno / ročno"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => update("channel", value)}
                    className={[
                      "min-h-10 flex-1 rounded-lg border px-3 text-sm font-medium",
                      form.channel === value
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {errors.channel ? (
                <p className="mt-1 text-xs text-red-600">{errors.channel}</p>
              ) : null}
            </fieldset>

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
                  label="E-pošta"
                  type="email"
                  error={errors.email}
                  value={form.email}
                  onChange={(v) => update("email", v)}
                />
                <Field
                  label="Telefon"
                  type="tel"
                  error={errors.phone}
                  value={form.phone}
                  onChange={(v) => update("phone", v)}
                />
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Obvezno: telefon ali e-pošta.
              </p>
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
                  label="VIN / številka šasije"
                  error={errors.vin}
                  value={form.vin}
                  onChange={(v) => update("vin", v)}
                />
                <Field
                  label="Znamka"
                  error={errors.make}
                  value={form.make}
                  onChange={(v) => update("make", v)}
                />
                <Field
                  label="Model"
                  error={errors.model}
                  value={form.model}
                  onChange={(v) => update("model", v)}
                />
                <Field
                  label="Letnik"
                  error={errors.year}
                  value={form.year}
                  onChange={(v) => update("year", v)}
                />
                <Field
                  label="Kilometri"
                  error={errors.mileage}
                  value={form.mileage}
                  onChange={(v) => update("mileage", v)}
                />
                <Field
                  label="Moč motorja (kW)"
                  error={errors.powerKw}
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
                  label="Storitev / kaj stranka želi"
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
                    Kaj stranka potrebuje / opis težave
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
                  <p className="mt-1 text-xs text-slate-500">
                    Obvezno: storitev ali opis težave.
                  </p>
                </div>
              </div>
            </fieldset>

            {formError ? (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900"
              >
                {formError}
              </div>
            ) : null}

            {successMessage ? (
              <div
                role="status"
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900"
              >
                {successMessage}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitPending}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Prekliči
            </button>
            <button
              type="submit"
              disabled={submitPending}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitPending ? "Shranjujem…" : "Ustvari servisni nalog"}
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
