import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets required by Next.js.
     * Public unauthenticated routes (/login, /auth/*, /povprasevanje, /api/povprasevanje)
     * are handled inside updateSession. /dashboard stays identity-gated.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
