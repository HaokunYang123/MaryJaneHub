-- Migration: 005_apply_rls_policies.sql
-- Purpose: RLS policies for entities and bank_connections tables
--
-- Security model:
-- - entities: Super admins manage, authenticated users see their assigned entities
-- - bank_connections: SELECT-only for authenticated (no write policies = denied)
-- - Service role bypasses RLS for admin operations
--
-- Depends on: 004_create_auth_helpers.sql (auth.has_entity_access function)

-- =============================================================================
-- ENTITIES TABLE POLICIES
-- =============================================================================

-- SELECT: Users see entities they have access to (via helper function)
-- Super admins see all entities (handled inside auth.has_entity_access)
CREATE POLICY "Users see their entities" ON public.entities
  FOR SELECT
  TO authenticated
  USING (auth.has_entity_access(id));

-- INSERT/UPDATE/DELETE: Only super admin can manage entities
-- Uses separate check for ALL operations (not the helper, for clarity)
CREATE POLICY "Super admin manages entities" ON public.entities
  FOR ALL
  TO authenticated
  USING (
    coalesce(
      (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean,
      false
    )
  )
  WITH CHECK (
    coalesce(
      (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean,
      false
    )
  );

-- =============================================================================
-- BANK_CONNECTIONS TABLE POLICIES
-- =============================================================================

-- SELECT: Users can see bank connection metadata for their entities
-- IMPORTANT: This does NOT expose vault_secret_id values - those are only
-- accessible via vault.decrypted_secrets which requires service_role
CREATE POLICY "Users see own bank connections" ON public.bank_connections
  FOR SELECT
  TO authenticated
  USING (auth.has_entity_access(entity_id));

-- NO INSERT/UPDATE/DELETE policies for authenticated role
-- This means:
-- - Authenticated users CANNOT write to bank_connections
-- - Only service_role (via admin client) can INSERT/UPDATE/DELETE
-- - This enforces SEC-02: frontend cannot access or modify bank credentials
--
-- Service role bypasses RLS entirely, so it can:
-- - Store Plaid tokens in Vault
-- - Create/update bank_connection records
-- - Access vault.decrypted_secrets for API calls
