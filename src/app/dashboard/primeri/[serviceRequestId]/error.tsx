"use client";

export default function CaseError({ reset }: { error: Error; reset: () => void }) {
  return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
    <p>Primera trenutno ni mogoče prikazati.</p>
    <button type="button" onClick={reset} className="mt-2 text-sm font-semibold underline">Poskusi znova</button>
  </div>;
}
