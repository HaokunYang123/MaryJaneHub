/**
 * API Route Authentication Middleware
 *
 * Helper functions for protecting API routes
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { UserRole } from "./config";

export interface AuthenticatedRequest extends NextRequest {
  user: {
    id: string;
    email: string;
    role: UserRole | null;
  };
}

export interface AuthResult {
  authenticated: boolean;
  user?: {
    id: string;
    email: string;
    role: UserRole | null;
  };
  response?: NextResponse;
}

/**
 * Verify the request is authenticated and user is whitelisted
 */
export async function verifyAuth(request: NextRequest): Promise<AuthResult> {
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
          // Read-only for API routes
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return {
      authenticated: false,
      response: NextResponse.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 }
      ),
    };
  }

  const email = session.user?.email;

  if (!email) {
    return {
      authenticated: false,
      response: NextResponse.json(
        { error: "Unauthorized", message: "No email in session" },
        { status: 401 }
      ),
    };
  }

  // Check whitelist
  const { data: isWhitelisted } = await supabase.rpc("is_email_whitelisted", {
    check_email: email,
  });

  if (!isWhitelisted) {
    return {
      authenticated: false,
      response: NextResponse.json(
        { error: "Forbidden", message: "User not in whitelist" },
        { status: 403 }
      ),
    };
  }

  // Get user role
  const { data: role } = await supabase.rpc("get_whitelist_role", {
    check_email: email,
  });

  return {
    authenticated: true,
    user: {
      id: session.user.id,
      email,
      role: role as UserRole | null,
    },
  };
}

/**
 * Require a specific role for the API route
 */
export async function requireRole(
  request: NextRequest,
  requiredRole: UserRole
): Promise<AuthResult> {
  const authResult = await verifyAuth(request);

  if (!authResult.authenticated) {
    return authResult;
  }

  const userRole = authResult.user?.role;

  // Admins can access everything
  if (userRole === "admin") {
    return authResult;
  }

  // Users can access user and viewer routes
  if (userRole === "user" && (requiredRole === "user" || requiredRole === "viewer")) {
    return authResult;
  }

  // Check exact role match
  if (userRole !== requiredRole) {
    return {
      authenticated: false,
      response: NextResponse.json(
        { error: "Forbidden", message: `${requiredRole} role required` },
        { status: 403 }
      ),
    };
  }

  return authResult;
}

/**
 * Require admin role
 */
export async function requireAdmin(request: NextRequest): Promise<AuthResult> {
  return requireRole(request, "admin");
}

/**
 * Higher-order function to wrap an API route with authentication
 */
export function withAuth(
  handler: (request: NextRequest, user: AuthResult["user"]) => Promise<NextResponse>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const authResult = await verifyAuth(request);

    if (!authResult.authenticated) {
      return authResult.response!;
    }

    return handler(request, authResult.user);
  };
}

/**
 * Higher-order function to wrap an API route with admin requirement
 */
export function withAdmin(
  handler: (request: NextRequest, user: AuthResult["user"]) => Promise<NextResponse>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const authResult = await requireAdmin(request);

    if (!authResult.authenticated) {
      return authResult.response!;
    }

    return handler(request, authResult.user);
  };
}
