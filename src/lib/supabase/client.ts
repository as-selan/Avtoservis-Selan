import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Minimal browser Supabase client foundation.
 * No auth, queries, or schema usage yet — placeholders only.
 */
export function createBrowserSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    return null;
  }

  return createClient(url, publishableKey);
}
