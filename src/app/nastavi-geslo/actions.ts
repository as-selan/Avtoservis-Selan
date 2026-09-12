"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SetPasswordState = {
  error: string | null;
};

const GENERIC_ERROR = "Gesla ni bilo mogoče nastaviti. Poskusite znova.";
const MIN_PASSWORD_LENGTH = 10;

export async function setPasswordAction(
  _prev: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/login");
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Geslo mora imeti vsaj ${MIN_PASSWORD_LENGTH} znakov.`,
    };
  }

  if (password !== confirm) {
    return { error: "Gesli se ne ujemata." };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: GENERIC_ERROR };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
