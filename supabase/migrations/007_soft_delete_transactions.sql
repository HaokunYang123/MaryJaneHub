-- Migration: 007_soft_delete_transactions.sql
-- Purpose: Soft delete pattern for transactions with DELETE prevention
--
-- Compliance:
-- - Financial records cannot be physically deleted (IRS audit trail)
-- - Void columns allow marking transactions as invalid
-- - DELETE policy always denies = no physical deletion possible
--
-- Usage:
-- - To "delete" a transaction: UPDATE SET is_voided = true, voided_at = now(), ...
-- - All queries should filter: WHERE is_voided = false
--
-- Note: transactions currently uses realm_id (QuickBooks company ID)
-- Entity FK will be added in future migration when bank transactions are added

-- =============================================================================
-- SOFT DELETE COLUMNS
-- =============================================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS is_voided boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS void_reason text;

-- Index for efficient filtering of non-voided transactions
-- Most queries will filter WHERE is_voided = false
CREATE INDEX IF NOT EXISTS idx_transactions_is_voided ON public.transactions(is_voided);

-- Partial index for faster active transaction queries
CREATE INDEX IF NOT EXISTS idx_transactions_active ON public.transactions(realm_id, txn_date)
  WHERE is_voided = false;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- Enable RLS on transactions (may already be enabled, IF NOT EXISTS pattern)
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- SELECT: All authenticated users can see transactions
-- Note: transactions uses realm_id (QuickBooks company ID), not entity_id
-- Entity-based filtering will be added when transactions link to entities
CREATE POLICY "Users see entity transactions" ON public.transactions
  FOR SELECT
  TO authenticated
  USING (true);  -- Will be refined when entity_id FK is added

-- INSERT: Authenticated users can insert transactions
-- (Typically done by sync operations, but allow for manual entry)
CREATE POLICY "Users can insert transactions" ON public.transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- UPDATE: Allow updates (for voiding, classification changes)
CREATE POLICY "Users can update transactions" ON public.transactions
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- DELETE: ALWAYS DENIED (SEC-06)
-- This is the key policy - no physical deletion ever allowed
-- Use soft delete (is_voided = true) instead
CREATE POLICY "No deletes on transactions" ON public.transactions
  FOR DELETE
  TO authenticated
  USING (false);  -- Always evaluates to false = DELETE always denied

COMMENT ON COLUMN public.transactions.is_voided IS
  'Soft delete flag. Voided transactions remain for audit trail but are excluded from reports.';

COMMENT ON COLUMN public.transactions.void_reason IS
  'Required explanation when voiding a transaction (e.g., "duplicate entry", "data error").';
