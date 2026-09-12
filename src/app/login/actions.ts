"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  error: string | null;
};

const GENERIC_CREDENTIALS_ERROR = "E-pošta ali geslo ni pravilno.";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !isValidEmail(email) || !password) {
    return { error: GENERIC_CREDENTIALS_ERROR };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: GENERIC_CREDENTIALS_ERROR };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
