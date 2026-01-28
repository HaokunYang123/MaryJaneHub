-- Migration: 006_create_audit_schema.sql
-- Purpose: Append-only audit logging infrastructure for IRS compliance
--
-- Features:
-- - Separate audit schema for isolation
-- - Immutable audit trail (INSERT-only, no UPDATE/DELETE)
-- - FORCE ROW LEVEL SECURITY ensures even postgres user follows policies
-- - Automatic triggers on bank_connections and transactions tables
--
-- Compliance:
-- - Supports IRS 280E classification decisions audit trail
-- - changed_by captures who made each change (NULL for service_role)
-- - Full before/after data capture in JSONB

-- =============================================================================
-- AUDIT SCHEMA
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS audit;

-- =============================================================================
-- AUDIT LOG TABLE
-- =============================================================================

CREATE TABLE audit.bank_data_changes (
  id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,                           -- NULL for INSERT
  new_data jsonb,                           -- NULL for DELETE
  changed_by uuid,                          -- NULL for service_role operations
  changed_at timestamptz NOT NULL DEFAULT now()
);

-- Index for querying by table and record
CREATE INDEX idx_audit_table_record ON audit.bank_data_changes(table_name, record_id);

-- Index for querying by time range (common for compliance queries)
CREATE INDEX idx_audit_changed_at ON audit.bank_data_changes(changed_at);

-- =============================================================================
-- ROW LEVEL SECURITY (APPEND-ONLY)
-- =============================================================================

-- Enable RLS
ALTER TABLE audit.bank_data_changes ENABLE ROW LEVEL SECURITY;

-- FORCE RLS: Even table owner (postgres) must follow policies
-- This ensures truly immutable audit trail
ALTER TABLE audit.bank_data_changes FORCE ROW LEVEL SECURITY;

-- INSERT-only policy: Anyone can append to audit log
-- This is the append-only mechanism - only INSERT is allowed
CREATE POLICY "Audit is append-only insert" ON audit.bank_data_changes
  FOR INSERT
  TO authenticated, service_role
  WITH CHECK (true);

-- SELECT policy: Only super admins can read audit log
-- Regular users cannot see audit trail (need-to-know basis)
CREATE POLICY "Admins can read audit" ON audit.bank_data_changes
  FOR SELECT
  TO authenticated
  USING (
    coalesce(
      (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean,
      false
    )
  );

-- Service role can also read (for admin operations)
CREATE POLICY "Service role can read audit" ON audit.bank_data_changes
  FOR SELECT
  TO service_role
  USING (true);

-- NO UPDATE or DELETE policies
-- This means UPDATE and DELETE are ALWAYS DENIED (SEC-05 compliance)
-- The audit log is truly immutable once written

-- =============================================================================
-- AUDIT TRIGGER FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION audit.log_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = audit, public
AS $$
BEGIN
  INSERT INTO audit.bank_data_changes (
    table_name,
    record_id,
    operation,
    old_data,
    new_data,
    changed_by,
    changed_at
  )
  VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END,
    auth.uid(),  -- NULL for service_role operations
    now()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION audit.log_change() IS
  'Trigger function that logs INSERT/UPDATE/DELETE operations to audit.bank_data_changes. Uses SECURITY DEFINER to insert into audit table.';

-- =============================================================================
-- APPLY TRIGGERS TO AUDITED TABLES
-- =============================================================================

-- Audit all changes to bank_connections (Plaid token storage)
CREATE TRIGGER audit_bank_connections
  AFTER INSERT OR UPDATE OR DELETE ON public.bank_connections
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();

-- Audit all changes to transactions (financial data)
CREATE TRIGGER audit_transactions
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();
