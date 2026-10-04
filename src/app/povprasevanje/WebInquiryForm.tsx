"use client";

import { useId, useRef, useState, type FormEvent, type HTMLAttributes } from "react";
import { FUEL_OPTIONS } from "@/lib/dashboard/demo-data";
import type { FuelType } from "@/lib/dashboard/types";
import {
  WEB_INTAKE_GENERIC_ERROR_MESSAGE,
  WEB_INTAKE_SUCCESS_MESSAGE,
  sanitizeWebIntakePublicResponse,
  type WebIntakePublicResponse,
} from "@/lib/intake/web-public";
import { validateWebIntakeForm } from "@/lib/intake/web-validate";

type FormState = {
  displayName: string;
  phone: string;
  email: string;
  registration: string;
  vin: string;
  nonstandardVin: boolean;
  make: string;
  model: string;
  year: string;
  powerKw: string;
  engine: string;
  engineType: string;
  fuel: FuelType | "";
  mileage: string;
  serviceWanted: string;
  problemDescription: string;
  bringsOwnMaterial: boolean;
  companyWebsite: string;
};

const INITIAL: FormState = {
  displayName: "",
  phone: "",
  email: "",
  registration: "",
  vin: "",
  nonstandardVin: false,
  make: "",
  model: "",
  year: "",
  powerKw: "",
  engine: "",
  engineType: "",
  fuel: "",
  mileage: "",
  serviceWanted: "",
  problemDescription: "",
  bringsOwnMaterial: false,
  companyWebsite: "",
};

type FieldKey = keyof FormState;

function newRequestId(): string {
  return crypto.randomUUID();
}

export function WebInquiryForm() {
  const formId = useId();
  const clientRequestIdRef = useRef<string | null>(null);
  const submitLockRef = useRef(false);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);
  const liveValidation = validateWebIntakeForm({
    ...form,
    clientRequestId: "00000000-0000-4000-8000-000000000000",
  });
  const liveErrors: Partial<Record<FieldKey, string>> = liveValidation.ok ? {} : liveValidation.fieldErrors;
  const fieldError = (key: FieldKey) => errors[key] ?? (touched[key] ? liveErrors[key] : undefined);
  const touch = (key: FieldKey) => setTouched((current) => ({ ...current, [key]: true }));

  function ensureClientRequestId(): string {
    if (!clientRequestIdRef.current) {
      clientRequestIdRef.current = newRequestId();
    }
    return clientRequestIdRef.current;
  }

  function update<K extends FieldKey>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setFormError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitLockRef.current || pending || success) return;

    setErrors({});
    setFormError(null);

    const validated = validateWebIntakeForm({
      displayName: form.displayName,
      phone: form.phone,
      email: form.email,
      vin: form.vin,
      nonstandardVin: form.nonstandardVin,
      registration: form.registration,
      make: form.make,
      model: form.model,
      year: form.year,
      powerKw: form.powerKw,
      engine: form.engine,
      engineType: form.engineType,
      fuel: form.fuel,
      mileage: form.mileage,
      serviceWanted: form.serviceWanted,
      problemDescription: form.problemDescription,
      bringsOwnMaterial: form.bringsOwnMaterial,
      clientRequestId: ensureClientRequestId(),
    });

    if (!validated.ok) {
      const mapped: Partial<Record<FieldKey, string>> = {};
      for (const [key, message] of Object.entries(validated.fieldErrors)) {
        if (key in INITIAL) mapped[key as FieldKey] = message;
      }
      setErrors(mapped);
      setFormError(validated.formError ?? "Preverite označena polja in poskusite znova.");
      return;
    }

    submitLockRef.current = true;
    setPending(true);
    try {
      const response = await fetch("/api/povprasevanje", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientRequestId: ensureClientRequestId(),
          displayName: form.displayName,
          phone: form.phone,
          email: form.email,
          vin: form.vin,
          nonstandardVin: form.nonstandardVin,
          registration: form.registration,
          make: form.make,
          model: form.model,
          year: form.year,
          powerKw: form.powerKw,
          engine: form.engine,
          engineType: form.engineType,
          fuel: form.fuel,
          mileage: form.mileage,
          serviceWanted: form.serviceWanted,
          problemDescription: form.problemDescription,
          bringsOwnMaterial: form.bringsOwnMaterial,
          companyWebsite: form.companyWebsite,
        }),
      });

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      const publicResult: WebIntakePublicResponse =
        sanitizeWebIntakePublicResponse(payload);

      if (publicResult.ok) {
        setSuccess(true);
        setFormError(null);
        setErrors({});
        clientRequestIdRef.current = newRequestId();
        return;
      }

      const mapped: Partial<Record<FieldKey, string>> = {};
      if (publicResult.fieldErrors) {
        for (const [key, message] of Object.entries(publicResult.fieldErrors)) {
          if (key in INITIAL) mapped[key as FieldKey] = message;
        }
      }
      setErrors(mapped);
      setFormError(publicResult.message || WEB_INTAKE_GENERIC_ERROR_MESSAGE);
      submitLockRef.current = false;
    } catch {
      setFormError(WEB_INTAKE_GENERIC_ERROR_MESSAGE);
      submitLockRef.current = false;
    } finally {
      setPending(false);
    }
  }

  if (success) {
    return (
      <div
        role="status"
        className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-5 text-sm text-emerald-950"
      >
        <p className="font-medium">{WEB_INTAKE_SUCCESS_MESSAGE}</p>
        <p className="mt-1 text-emerald-900/80">
          Po potrebi vas bomo kontaktirali na navedeni telefon ali e-pošto.
        </p>
      </div>
    );
  }

  const errorSummaryId = `${formId}-errors`;
  const hasErrors = Boolean(formError) || Object.keys(errors).length > 0;

  return (
    <form
      onSubmit={handleSubmit}
      className="relative space-y-8"
      noValidate
      aria-describedby={hasErrors ? errorSummaryId : undefined}
    >
      {hasErrors ? (
        <div
          id={errorSummaryId}
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          {formError ?? "Preverite označena polja in poskusite znova."}
        </div>
      ) : null}

      <div className="pointer-events-none absolute top-0 left-0 h-px w-px overflow-hidden opacity-0" aria-hidden="true">
        <label htmlFor={`${formId}-company-website`}>Spletna stran</label>
        <input
          id={`${formId}-company-website`}
          name="company_website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={form.companyWebsite}
          onChange={(e) => update("companyWebsite", e.target.value)}
        />
      </div>

      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Kontakt
        </legend>
        <Field
          id={`${formId}-name`}
          label="Ime in priimek / naziv"
          required
          error={fieldError("displayName")}
          onBlur={() => touch("displayName")}
          autoComplete="name"
          value={form.displayName}
          onChange={(v) => update("displayName", v)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            id={`${formId}-phone`}
            label="Telefon"
            required
            onBlur={() => touch("phone")}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            error={fieldError("phone")}
            value={form.phone}
            onChange={(v) => update("phone", v)}
          />
          <Field
            id={`${formId}-email`}
            label="E-pošta"
            required
            onBlur={() => touch("email")}
            type="email"
            autoComplete="email"
            error={fieldError("email")}
            value={form.email}
            onChange={(v) => update("email", v)}
          />
        </div>
        <p className="text-xs text-slate-500">Za spletno povpraševanje sta potrebna telefon in e-pošta.</p>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Vozilo
        </legend>
        <p className="text-xs text-slate-500">VIN oziroma številka šasije, znamka in model so obvezni. Ostale podatke lahko dopolnimo kasneje.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            id={`${formId}-reg`}
            label="Registrska številka"
            autoComplete="off"
            onBlur={() => touch("registration")}
            error={fieldError("registration")}
            value={form.registration}
            onChange={(v) => update("registration", v)}
          />
          <Field
            id={`${formId}-vin`}
            label="VIN / številka šasije"
            required
            onBlur={() => touch("vin")}
            autoComplete="off"
            error={fieldError("vin")}
            value={form.vin}
            onChange={(v) => update("vin", v)}
          />
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="mt-1" checked={form.nonstandardVin}
              onChange={(event) => { update("nonstandardVin", event.target.checked); touch("vin"); }} />
            Vozilo nima standardnega 17-mestnega VIN. Vpisal/-a sem njegovo nestandardno številko šasije.
          </label>
          <Field
            id={`${formId}-make`}
            label="Znamka"
            required
            onBlur={() => touch("make")}
            autoComplete="off"
            error={fieldError("make")}
            value={form.make}
            onChange={(v) => update("make", v)}
          />
          <Field
            id={`${formId}-model`}
            label="Model"
            required
            onBlur={() => touch("model")}
            autoComplete="off"
            error={fieldError("model")}
            value={form.model}
            onChange={(v) => update("model", v)}
          />
          <Field
            id={`${formId}-year`}
            label="Letnik"
            inputMode="numeric"
            autoComplete="off"
            onBlur={() => touch("year")}
            error={fieldError("year")}
            value={form.year}
            onChange={(v) => update("year", v)}
          />
          <Field
            id={`${formId}-power`}
            label="Moč kW"
            inputMode="numeric"
            autoComplete="off"
            onBlur={() => touch("powerKw")}
            error={fieldError("powerKw")}
            value={form.powerKw}
            onChange={(v) => update("powerKw", v)}
          />
          <Field
            id={`${formId}-engine`}
            label="Motor"
            autoComplete="off"
            onBlur={() => touch("engine")}
            error={fieldError("engine")}
            value={form.engine}
            onChange={(v) => update("engine", v)}
          />
          <Field
            id={`${formId}-engine-type`}
            label="Tip motorja"
            autoComplete="off"
            onBlur={() => touch("engineType")}
            error={fieldError("engineType")}
            value={form.engineType}
            onChange={(v) => update("engineType", v)}
          />
          <div>
            <label
              htmlFor={`${formId}-fuel`}
              className="mb-1 block text-sm font-medium text-slate-800"
            >
              Gorivo
            </label>
            <select
              id={`${formId}-fuel`}
              value={form.fuel}
              aria-invalid={Boolean(fieldError("fuel"))}
              onBlur={() => touch("fuel")}
              onChange={(e) => update("fuel", e.target.value as FuelType | "")}
              className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2"
            >
              <option value="">Ni izbrano (neobvezno)</option>
              {FUEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {fieldError("fuel") ? (
              <p className="mt-1 text-xs text-red-600">{fieldError("fuel")}</p>
            ) : null}
          </div>
          <Field
            id={`${formId}-mileage`}
            label="Trenutni kilometri"
            inputMode="numeric"
            autoComplete="off"
            onBlur={() => touch("mileage")}
            error={fieldError("mileage")}
            value={form.mileage}
            onChange={(v) => update("mileage", v)}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Servis
        </legend>
        <Field
          id={`${formId}-service`}
          label="Želena storitev"
          onBlur={() => touch("serviceWanted")}
          autoComplete="off"
          error={fieldError("serviceWanted")}
          value={form.serviceWanted}
          onChange={(v) => update("serviceWanted", v)}
        />
        <div>
          <label
            htmlFor={`${formId}-problem`}
            className="mb-1 block text-sm font-medium text-slate-800"
          >
            Opis težave
          </label>
          <textarea
            id={`${formId}-problem`}
            rows={4}
            aria-invalid={Boolean(fieldError("problemDescription"))}
            onBlur={() => touch("problemDescription")}
            value={form.problemDescription}
            onChange={(e) => update("problemDescription", e.target.value)}
            className={[
              "w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2",
              fieldError("problemDescription") ? "border-red-400" : "border-slate-300",
            ].join(" ")}
          />
          {fieldError("problemDescription") ? (
            <p className="mt-1 text-xs text-red-600">{fieldError("problemDescription")}</p>
          ) : null}
        </div>
        <p className="text-xs text-slate-500">
          Obvezno: želena storitev ali opis težave.
        </p>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-800">
            Lasten material
          </legend>
          <div className="flex gap-2">
            {(
              [
                { value: false, label: "Ne" },
                { value: true, label: "Da" },
              ] as const
            ).map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => update("bringsOwnMaterial", opt.value)}
                className={[
                  "min-h-11 flex-1 rounded-lg border px-3 text-sm font-medium",
                  form.bringsOwnMaterial === opt.value
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50",
                ].join(" ")}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </fieldset>
      </fieldset>

      <button
        type="submit"
        disabled={pending || !liveValidation.ok}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? "Pošiljam…" : "Pošlji povpraševanje"}
      </button>
      {!liveValidation.ok && <p className="text-xs text-slate-600">Izpolnite obvezna polja. Napako posameznega polja vidite, ko ga zapustite.</p>}
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  type = "text",
  inputMode,
  autoComplete,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  type?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-800">
        {label}
        {required ? <span className="text-slate-500"> (obvezno)</span> : null}
      </label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        required={required}
        aria-invalid={Boolean(error)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className={[
          "h-11 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 outline-none ring-blue-600 focus:ring-2",
          error ? "border-red-400" : "border-slate-300",
        ].join(" ")}
      />
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
