-- Create bank_connections table for storing Plaid connection metadata
-- vault_secret_id references encrypted Plaid access token in Supabase Vault

CREATE TABLE IF NOT EXISTS public.bank_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  institution_name text NOT NULL,
  institution_id text,
  vault_secret_id uuid NOT NULL,
  plaid_item_id text,
  last_sync_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error', 'requires_reauth', 'disconnected')),
  status_detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Comment explaining vault_secret_id purpose
COMMENT ON COLUMN public.bank_connections.vault_secret_id IS 'References vault.secrets.id containing encrypted Plaid access token';

-- Index for efficient entity lookups
CREATE INDEX idx_bank_connections_entity_id ON public.bank_connections(entity_id);

-- One Plaid item per connection (webhook correlation)
CREATE UNIQUE INDEX idx_bank_connections_plaid_item_id ON public.bank_connections(plaid_item_id) WHERE plaid_item_id IS NOT NULL;

-- Enable Row Level Security (policies will be added in Plan 02)
ALTER TABLE public.bank_connections ENABLE ROW LEVEL SECURITY;
