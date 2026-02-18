import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/quickbooks/auth";
import { saveTokens } from "@/lib/quickbooks/token-store";

/**
 * GET /api/quickbooks/callback
 *
 * OAuth callback handler. Receives authorization code from QuickBooks,
 * exchanges it for tokens, and stores them in Supabase.
 *
 * Query params from QuickBooks:
 * - code: Authorization code
 * - realmId: QuickBooks company ID
 * - state: CSRF state token
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const realmId = searchParams.get("realmId");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Check for error from QuickBooks
  if (error) {
    const errorDescription = searchParams.get("error_description") || "Unknown error";
    console.error(`QuickBooks OAuth error: ${error} - ${errorDescription}`);
    return NextResponse.redirect(
      new URL(`/settings?qb_error=${encodeURIComponent(errorDescription)}`, request.url)
    );
  }

  // Validate required parameters
  if (!code || !realmId) {
    console.error("QuickBooks callback missing code or realmId");
    return NextResponse.redirect(
      new URL("/settings?qb_error=Missing+authorization+parameters", request.url)
    );
  }

  // Validate CSRF state
  const storedState = request.cookies.get("qb_oauth_state")?.value;
  if (!storedState || storedState !== state) {
    console.error("QuickBooks callback state mismatch (CSRF check failed)");
    return NextResponse.redirect(
      new URL("/settings?qb_error=Invalid+state+parameter", request.url)
    );
  }

  try {
    // Exchange code for tokens
    // Pass the full URL so intuit-oauth can extract parameters
    const callbackUrl = request.url;
    const tokens = await exchangeCodeForTokens(callbackUrl);

    // Save tokens to Supabase
    const saved = await saveTokens(tokens);
    if (!saved) {
      throw new Error("Failed to save tokens to database");
    }

    console.log("QuickBooks connected successfully.");

    // Clear the state cookie and redirect to success page
    const response = NextResponse.redirect(
      new URL("/settings?qb_connected=true", request.url)
    );
    response.cookies.delete("qb_oauth_state");

    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("QuickBooks token exchange error:", errorMessage);

    return NextResponse.redirect(
      new URL(`/settings?qb_error=${encodeURIComponent(errorMessage)}`, request.url)
    );
  }
}
