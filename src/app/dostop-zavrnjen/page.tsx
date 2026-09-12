import { Car } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AccessDeniedPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Car className="h-5 w-5" aria-hidden />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Avtoservis Selan</h1>
        </div>

        <div className="space-y-3 text-sm leading-relaxed text-slate-700">
          <p>Ta uporabniški račun nima dostopa do aplikacije Avtoservis Selan.</p>
          <p>Za dostop se obrnite na administratorja.</p>
        </div>

        <form action="/auth/signout" method="post" className="mt-6">
          <button
            type="submit"
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
          >
            Odjava
          </button>
        </form>
      </div>
    </main>
  );
}
