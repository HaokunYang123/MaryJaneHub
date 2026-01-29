/**
 * OAuth Callback Handler
 *
 * Handles the callback from Google OAuth and verifies whitelist
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_CONFIG } from "@/lib/auth/config";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const redirect = requestUrl.searchParams.get("redirect") || AUTH_CONFIG.redirects.afterLogin;
  const origin = requestUrl.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  // Exchange the code for a session
  const { data: { session }, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

  if (sessionError || !session) {
    console.error("Session exchange error:", sessionError);
    return NextResponse.redirect(`${origin}/login?error=session_failed`);
  }

  // Check if user is whitelisted
  const email = session.user?.email;

  if (!email) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=no_email`);
  }

  const { data: isWhitelisted, error: whitelistError } = await supabase.rpc("is_email_whitelisted", {
    check_email: email,
  });

  if (whitelistError) {
    console.error("Whitelist check error:", whitelistError);
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=whitelist_check_failed`);
  }

  if (!isWhitelisted) {
    // Sign out and redirect to unauthorized
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/unauthorized?email=${encodeURIComponent(email)}`);
  }

  // User is whitelisted, redirect to the requested page or dashboard
  return NextResponse.redirect(`${origin}${redirect}`);
}
