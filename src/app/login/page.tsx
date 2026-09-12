import { Car } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ napaka?: string }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (data?.claims) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const linkError =
    params.napaka === "povezava"
      ? "Povezava ni veljavna ali je potekla. Zahtevajte novo povabilo."
      : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-slate-900 px-6 py-7 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
              <Car className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight">
                Avtoservis Selan
              </h1>
              <p className="text-sm text-slate-300">Prijava v operativni sistem</p>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-6 py-6">
          <p className="text-sm leading-relaxed text-slate-600">
            Dostop je omogočen samo povabljenim uporabnikom.
          </p>

          {linkError ? (
            <p
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
              role="alert"
            >
              {linkError}
            </p>
          ) : null}

          <LoginForm />
        </div>
      </div>
    </main>
  );
}
