import type { Metadata } from "next";
import { Car } from "lucide-react";
import { CompletionClient } from "./CompletionClient";

export const metadata: Metadata = {
  title: "Dopolnitev podatkov — Avtoservis Selan",
  description: "Dopolnite manjkajoče podatke za servisno povpraševanje.",
};

export default function DopolnitevPage() {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 sm:py-10">
      <div className="mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-slate-900 px-5 py-6 text-white sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600">
              <Car className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-slate-300">Avtoservis Selan</p>
              <h1 className="truncate text-lg font-semibold tracking-tight">
                Dopolnitev podatkov
              </h1>
            </div>
          </div>
        </div>
        <div className="px-5 py-6 sm:px-6">
          <CompletionClient />
        </div>
      </div>
    </main>
  );
}
