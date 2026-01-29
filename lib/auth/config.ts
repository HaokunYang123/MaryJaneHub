/**
 * Auth Configuration
 *
 * Centralized authentication configuration for Google OAuth
 */

export const AUTH_CONFIG = {
  // Routes that require authentication
  protectedRoutes: [
    "/dashboard",
    "/documents",
    "/settings",
    "/api/documents",
    "/api/quickbooks",
    "/api/cron",
  ],

  // Routes that should remain public
  publicRoutes: [
    "/",
    "/login",
    "/unauthorized",
    "/api/auth/callback",
  ],

  // Redirect destinations
  redirects: {
    afterLogin: "/dashboard",
    afterLogout: "/login",
    unauthorized: "/unauthorized",
  },

  // Session cookie name
  cookieName: "sb-auth-token",

  // User roles
  roles: {
    ADMIN: "admin",
    USER: "user",
    VIEWER: "viewer",
  } as const,
} as const;

export type UserRole = (typeof AUTH_CONFIG.roles)[keyof typeof AUTH_CONFIG.roles];

/**
 * Check if a route requires authentication
 */
export function isProtectedRoute(pathname: string): boolean {
  return AUTH_CONFIG.protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

/**
 * Check if a route is public
 */
export function isPublicRoute(pathname: string): boolean {
  return AUTH_CONFIG.publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}
