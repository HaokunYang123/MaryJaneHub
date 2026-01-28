import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase Admin Client (Service Role)
 *
 * USE ONLY IN SERVER-SIDE CODE (API routes, server actions)
 * NEVER import this in client components
 *
 * This client bypasses RLS and has full database access.
 * Use for:
 * - Vault operations (storing/retrieving encrypted secrets)
 * - Admin operations (updating user app_metadata)
 * - Background jobs that need cross-tenant access
 */
export function createAdminClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is required');
  }

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for admin operations');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
