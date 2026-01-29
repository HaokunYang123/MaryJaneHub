/**
 * Session Management
 *
 * Functions for managing user sessions with Supabase Auth
 */

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { User, Session } from "@supabase/supabase-js";
import { isEmailWhitelisted, getWhitelistRole } from "./whitelist";
import { UserRole } from "./config";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: UserRole | null;
}

export interface SessionResult {
  user: AuthUser | null;
  session: Session | null;
  error?: string;
}

/**
 * Create a Supabase client for server-side usage
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
      },
    }
  );
}

/**
 * Get the current session and user
 */
export async function getSession(): Promise<SessionResult> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      return { user: null, session: null, error: error.message };
    }

    if (!session?.user) {
      return { user: null, session: null };
    }

    const user = session.user;
    const email = user.email;

    if (!email) {
      return { user: null, session: null, error: "No email in session" };
    }

    // Check if user is whitelisted
    const isWhitelisted = await isEmailWhitelisted(email);
    if (!isWhitelisted) {
      // Sign out non-whitelisted users
      await supabase.auth.signOut();
      return { user: null, session: null, error: "User not whitelisted" };
    }

    // Get user's role
    const role = await getWhitelistRole(email);

    const authUser: AuthUser = {
      id: user.id,
      email,
      name: user.user_metadata?.full_name || user.user_metadata?.name || null,
      avatarUrl: user.user_metadata?.avatar_url || null,
      role,
    };

    return { user: authUser, session };
  } catch (error) {
    console.error("Error getting session:", error);
    return { user: null, session: null, error: "Failed to get session" };
  }
}

/**
 * Get the current user (simplified)
 */
export async function getUser(): Promise<AuthUser | null> {
  const { user } = await getSession();
  return user;
}

/**
 * Check if the current user has a specific role
 */
export async function hasRole(requiredRole: UserRole): Promise<boolean> {
  const user = await getUser();
  if (!user?.role) return false;

  // Admins can access everything
  if (user.role === "admin") return true;

  // Users can access user and viewer routes
  if (user.role === "user" && (requiredRole === "user" || requiredRole === "viewer")) {
    return true;
  }

  // Viewers can only access viewer routes
  return user.role === requiredRole;
}

/**
 * Sign out the current user
 */
export async function signOut(): Promise<{ error?: string }> {
  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      return { error: error.message };
    }

    return {};
  } catch (error) {
    console.error("Error signing out:", error);
    return { error: "Failed to sign out" };
  }
}
