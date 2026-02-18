/**
 * Next.js Middleware
 *
 * Protects routes and manages authentication
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_CONFIG, isProtectedRoute, isPublicRoute } from "@/lib/auth/config";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authHeader = request.headers.get("authorization")?.trim() || "";

  // Skip middleware for static files and _next
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Cron routes are only accessible via CRON_SECRET bearer token.
  // Fail closed: no fallback to session auth, preventing OAuth users from
  // triggering cron jobs directly.
  if (pathname.startsWith("/api/cron")) {
    const cronSecret = process.env.CRON_SECRET?.trim();
    if (!cronSecret) {
      return NextResponse.json(
        { error: "Forbidden", message: "Cron routes are not configured" },
        { status: 403 }
      );
    }
    if (authHeader === `Bearer ${cronSecret}`) {
      return NextResponse.next();
    }
    return NextResponse.json(
      { error: "Unauthorized", message: "Invalid cron secret" },
      { status: 401 }
    );
  }

  // Create response to pass to supabase client
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Create Supabase client
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if expired
  const { data: { session } } = await supabase.auth.getSession();

  // Check if route is protected
  if (isProtectedRoute(pathname)) {
    // No session, redirect to login
    if (!session) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Unauthorized", message: "Authentication required" },
          { status: 401 }
        );
      }
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Check if user is whitelisted (using RPC function)
    const email = session.user?.email;
    if (email) {
      const { data: isWhitelisted } = await supabase.rpc("is_email_whitelisted", {
        check_email: email,
      });

      if (!isWhitelisted) {
        // Sign out and redirect to unauthorized
        await supabase.auth.signOut();
        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { error: "Forbidden", message: "User not in whitelist" },
            { status: 403 }
          );
        }
        return NextResponse.redirect(new URL("/unauthorized", request.url));
      }
    }
  }

  // If on login page and already authenticated, redirect to dashboard
  if (pathname === "/login" && session) {
    const email = session.user?.email;
    if (email) {
      const { data: isWhitelisted } = await supabase.rpc("is_email_whitelisted", {
        check_email: email,
      });

      if (isWhitelisted) {
        return NextResponse.redirect(new URL(AUTH_CONFIG.redirects.afterLogin, request.url));
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
