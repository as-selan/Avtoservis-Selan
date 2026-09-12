/**
 * Deterministic assertion: auth redirect preserves Supabase cookies + cache headers.
 * Run: npx --yes tsx scripts/proxy-redirect.assert.ts
 */
import { NextRequest, NextResponse } from "next/server";
import { redirectToLoginPreservingAuthState } from "../src/lib/supabase/proxy";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const request = new NextRequest("http://localhost:3010/dashboard");
const supabaseResponse = NextResponse.next({ request });
supabaseResponse.cookies.set("sb-test-auth-token", "refreshed-value", {
  path: "/",
  httpOnly: true,
  sameSite: "lax",
});
supabaseResponse.headers.set("Cache-Control", "private, no-store");
supabaseResponse.headers.set("Expires", "0");
supabaseResponse.headers.set("Pragma", "no-cache");

const redirectResponse = redirectToLoginPreservingAuthState(
  request,
  supabaseResponse,
);

assert(redirectResponse.status >= 300 && redirectResponse.status < 400, "expected redirect");
assert(
  new URL(redirectResponse.headers.get("location") ?? "", request.url).pathname ===
    "/login",
  "expected /login destination",
);

const cookie = redirectResponse.cookies.get("sb-test-auth-token");
assert(cookie?.value === "refreshed-value", "expected preserved auth cookie");
assert(
  redirectResponse.headers.get("cache-control") === "private, no-store",
  "expected preserved Cache-Control",
);
assert(redirectResponse.headers.get("expires") === "0", "expected preserved Expires");
assert(
  redirectResponse.headers.get("pragma") === "no-cache",
  "expected preserved Pragma",
);

console.log("proxy-redirect.assert: PASS");
