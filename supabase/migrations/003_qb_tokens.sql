-- QuickBooks OAuth tokens table
-- Stores access and refresh tokens for QuickBooks Online integration
-- Single-tenant design: only one row with id='default'

CREATE TABLE IF NOT EXISTS qb_tokens (
    id TEXT PRIMARY KEY DEFAULT 'default',
    realm_id TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_qb_tokens_realm_id ON qb_tokens(realm_id);

-- Comment on table
COMMENT ON TABLE qb_tokens IS 'Stores QuickBooks Online OAuth tokens for API access';
COMMENT ON COLUMN qb_tokens.realm_id IS 'QuickBooks company ID (realmId)';
COMMENT ON COLUMN qb_tokens.access_token IS 'OAuth access token for API calls';
COMMENT ON COLUMN qb_tokens.refresh_token IS 'OAuth refresh token for token renewal';
COMMENT ON COLUMN qb_tokens.expires_at IS 'Access token expiry timestamp';
