import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { passwordSetupOtpType } from "@/app/login/recovery-link";

/**
 * Password setup callback for invitation and recovery token hashes.
 * Does not accept arbitrary external `next` URLs (no open redirect).
 * Auth secrets/tokens are stripped from the redirect URL.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = passwordSetupOtpType(searchParams.get("type"));

  const loginErrorUrl = new URL("/login", request.url);
  loginErrorUrl.searchParams.set("napaka", "povezava");

  if (!token_hash || !type) {
    return NextResponse.redirect(loginErrorUrl);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash,
  });

  if (error) {
    return NextResponse.redirect(loginErrorUrl);
  }

  return NextResponse.redirect(new URL("/nastavi-geslo", request.url));
}
