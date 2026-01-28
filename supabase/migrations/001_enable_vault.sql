-- Enable Supabase Vault for encrypted secrets storage
-- Provides AES-256-GCM encryption at rest
-- Only service_role can access vault.decrypted_secrets view
CREATE EXTENSION IF NOT EXISTS supabase_vault;
