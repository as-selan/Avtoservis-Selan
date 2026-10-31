"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CUSTOMER_VEHICLE_EDIT_GENERIC_ERROR,
} from "@/lib/customers/edit-messages";
import { updateCustomerAction } from "@/lib/customers/actions";
import type { CustomerDetailView } from "@/lib/customers/types";

const inputClass =
  "mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";
const labelClass =
  "block text-xs font-medium tracking-wide text-slate-500 uppercase";

export function CustomerEditPanel({
  customer,
  onCancel,
  onSaved,
}: {
  customer: CustomerDetailView;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [customerType, setCustomerType] = useState(
    customer.customerType === "business" ? "business" : "individual",
  );
  const [displayName, setDisplayName] = useState(customer.displayName);
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [email, setEmail] = useState(customer.email ?? "");
  const [notes, setNotes] = useState(customer.notes ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);

    startTransition(async () => {
      try {
        const result = await updateCustomerAction({
          customerId: customer.id,
          customerType,
          displayName,
          phone,
          email,
          notes,
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
          <label className={labelClass} htmlFor="edit-customer-type">
            Tip stranke
          </label>
          <select
            id="edit-customer-type"
            value={customerType}
            onChange={(e) => setCustomerType(e.target.value)}
            className={inputClass}
            disabled={pending}
          >
            <option value="individual">Fizična oseba</option>
            <option value="business">Podjetje</option>
          </select>
          {fieldErrors.customerType ? (
            <p className="mt-1 text-xs text-red-700">{fieldErrors.customerType}</p>
          ) : null}
        </div>
        <div>
          <label className={labelClass} htmlFor="edit-customer-name">
            Ime / naziv
          </label>
          <input
            id="edit-customer-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={inputClass}
            disabled={pending}
            autoComplete="organization"
          />
          {fieldErrors.displayName ? (
            <p className="mt-1 text-xs text-red-700">{fieldErrors.displayName}</p>
          ) : null}
        </div>
        <div>
          <label className={labelClass} htmlFor="edit-customer-phone">
            Telefon
          </label>
          <input
            id="edit-customer-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
            disabled={pending}
            autoComplete="tel"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="edit-customer-email">
            E-pošta
          </label>
          <input
            id="edit-customer-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            disabled={pending}
            autoComplete="email"
          />
          {fieldErrors.email ? (
            <p className="mt-1 text-xs text-red-700">{fieldErrors.email}</p>
          ) : null}
        </div>
      </div>
      <div>
        <label className={labelClass} htmlFor="edit-customer-notes">
          Opombe
        </label>
        <textarea
          id="edit-customer-notes"
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
