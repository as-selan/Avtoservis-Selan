import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Request-scoped Supabase server client (cookie-backed SSR).
 * Do not cache this client globally — create a new one per request.
 *
 * Uses the publishable key only. Never use the service role in app code.
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }

  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component where cookies are read-only.
          // Safe to ignore when proxy.ts refreshes the session.
        }
      },
    },
  });
}
