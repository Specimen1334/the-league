// apps/web/middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// NOTE: In Next.js App Router, route groups like `app/(auth)/...` do NOT appear
// in the URL. So `app/(auth)/login/page.tsx` resolves to `/login`.
const AUTH_PATHS = new Set<string>(["/login", "/register", "/forgot-password"]);

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Allow _next, static, etc. (assets)
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Look for the backend session cookie.
  // Fastify sets "sid" when you log in.
  const sidCookie = req.cookies.get("sid");
  const isAuthed = Boolean(sidCookie?.value);

  // Root is not a real page in this app.
  if (pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = isAuthed ? "/dashboard" : "/login";
    return NextResponse.redirect(url);
  }

  // Public auth pages are always allowed.
  //
  // IMPORTANT:
  // We deliberately do NOT redirect "authenticated" users away from /login
  // or other auth routes here.
  //
  // This middleware can only see whether a session cookie exists, not whether
  // that cookie is still valid server-side. If the cookie is stale/invalid
  // (e.g. server restart, cleared sessions), redirecting away from /login would
  // trap the user in a loop where protected pages 401 and /login is unreachable.
  if (AUTH_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // If no session cookie: redirect to /login, with ?next=originalPath
  if (!isAuthed) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  // Otherwise, let the request through.
  return NextResponse.next();
}

// Apply middleware to all application routes.
export const config = {
  matcher: ["/((?!api|_next|static|favicon.ico).*)"]
};
