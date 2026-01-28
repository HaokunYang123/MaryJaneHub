-- Migration: 004_create_auth_helpers.sql
-- Purpose: RLS helper functions for tenant isolation with super-admin override
--
-- This function enables:
-- - Super admin override: Users with is_super_admin: true see all entities
-- - Entity-scoped access: Regular users only see entities in their entity_ids array
-- - JWT-based: Claims stored in app_metadata (set via admin API, see user-admin.ts)
--
-- Security notes:
-- - SECURITY DEFINER: Function runs with definer privileges to access auth.jwt()
-- - search_path: Locked to auth,public to prevent search path injection

CREATE OR REPLACE FUNCTION auth.has_entity_access(check_entity_id uuid)
RETURNS boolean AS $$
BEGIN
  -- Super admin sees everything (Mary + accountant users per ENT-04)
  IF coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean,
    false
  ) THEN
    RETURN true;
  END IF;

  -- Regular user: check if entity is in their entity_ids array
  -- entity_ids is set via admin API when user is assigned to entities
  RETURN check_entity_id = ANY(
    ARRAY(
      SELECT jsonb_array_elements_text(
        auth.jwt() -> 'app_metadata' -> 'entity_ids'
      )::uuid
    )
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = auth, public;

COMMENT ON FUNCTION auth.has_entity_access(uuid) IS
  'Returns true if current user can access the given entity. Super admins see all entities; regular users see only entities in their app_metadata.entity_ids array.';
