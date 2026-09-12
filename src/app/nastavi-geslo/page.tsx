import { Car } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SetPasswordForm } from "./SetPasswordForm";

export default async function SetPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-slate-900 px-6 py-7 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
              <Car className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                Avtoservis Selan
              </h1>
              <p className="text-sm text-slate-300">Nastavitev gesla</p>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-6 py-6">
          <p className="text-sm leading-relaxed text-slate-600">
            Nastavite geslo za svoj povabljeni račun. Po shranjevanju boste
            preusmerjeni v aplikacijo.
          </p>
          <SetPasswordForm />
        </div>
      </div>
    </main>
  );
}
