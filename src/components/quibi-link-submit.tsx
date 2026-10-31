"use client";

import { useFormStatus } from "react-dom";

export function QuibiLinkSubmit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} aria-busy={pending}
    className="rounded border border-blue-700 px-3 py-2 text-sm text-blue-700 disabled:opacity-50">
    {pending ? "Povezujem..." : children}
  </button>;
}
