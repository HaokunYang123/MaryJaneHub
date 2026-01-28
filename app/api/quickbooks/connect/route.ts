import { NextResponse } from "next/server";
import { getAuthorizationUrl } from "@/lib/quickbooks/auth";

/**
 * GET /api/quickbooks/connect
 *
 * Initiates QuickBooks OAuth flow by redirecting user to Intuit's authorization page.
 * After authorization, user is redirected back to /api/quickbooks/callback
 */
export async function GET(): Promise<NextResponse> {
  try {
    const { url, state } = getAuthorizationUrl();

    // Create response that redirects to QuickBooks
    const response = NextResponse.redirect(url);

    // Store state in cookie for CSRF validation in callback
    response.cookies.set("qb_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 10, // 10 minutes
      path: "/",
    });

    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("QuickBooks connect error:", errorMessage);

    return NextResponse.json(
      {
        error: "Failed to initiate QuickBooks connection",
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
