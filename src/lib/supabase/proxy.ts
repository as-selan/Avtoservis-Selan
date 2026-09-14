import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refresh the Auth session and gate on identity only.
 * Organization membership checks belong in server helpers (e.g. requireWorkshopAccess),
 * not in proxy — RLS remains authoritative.
 *
 * Invite-only note: the app has no signup UI, but hosted Supabase Auth must also
 * have public signup disabled before launch (Dashboard setting). This code does
 * not change that remote setting.
 *
 * Unauthenticated routes are explicit — do not wildcard /api.
 * /dashboard and other workshop routes stay identity-gated below.
 */
export function isPublicUnauthenticatedPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/auth" ||
    pathname.startsWith("/auth/") ||
    pathname === "/povprasevanje" ||
    pathname === "/api/povprasevanje"
  );
}

function isPublicAuthRoute(pathname: string): boolean {
  return isPublicUnauthenticatedPath(pathname);
}

/**
 * Build a /login redirect that keeps Supabase cookie + cache-header state from
 * the response established by setAll() during session refresh.
 */
export function redirectToLoginPreservingAuthState(
  request: NextRequest,
  supabaseResponse: NextResponse,
): NextResponse {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";

  const redirectResponse = NextResponse.redirect(loginUrl);

  supabaseResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });

  for (const headerName of ["cache-control", "expires", "pragma"] as const) {
    const value = supabaseResponse.headers.get(headerName);
    if (value) {
      redirectResponse.headers.set(headerName, value);
    }
  }

  return redirectResponse;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const pathname = request.nextUrl.pathname;
  const isPublic = isPublicAuthRoute(pathname);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    // Fail closed for protected routes when public Supabase env is missing.
    if (isPublic) {
      return supabaseResponse;
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([key, value]) =>
          supabaseResponse.headers.set(key, value),
        );
      },
    },
  });

  // Trusted identity check — do not use getSession() for authorization.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims && !isPublic) {
    return redirectToLoginPreservingAuthState(request, supabaseResponse);
  }

  return supabaseResponse;
}
