import { createAdminClient } from './admin';

/**
 * Vault Operations Helper
 *
 * Uses service_role client to interact with Supabase Vault.
 * Only service_role can:
 * - Call vault.create_secret() to encrypt and store
 * - Query vault.decrypted_secrets view to retrieve
 *
 * Frontend/authenticated users CANNOT access decrypted secrets.
 */

interface VaultSecret {
  id: string;
  name: string;
  secret: string;
  created_at: string;
  updated_at: string;
}

/**
 * Store a secret in Vault (encrypted at rest)
 *
 * @param secretValue - The sensitive value to encrypt (e.g., Plaid access token)
 * @param secretName - Optional name/label for the secret
 * @returns The vault secret ID to store in your table
 */
export async function storeSecret(
  secretValue: string,
  secretName?: string
): Promise<string> {
  const admin = createAdminClient();

  // Call vault.create_secret() - only works with service_role
  const { data, error } = await admin.rpc('vault.create_secret', {
    new_secret: secretValue,
    new_name: secretName || null
  });

  if (error) {
    throw new Error(`Failed to store secret in Vault: ${error.message}`);
  }

  // Returns the UUID of the created secret
  return data as string;
}

/**
 * Retrieve a decrypted secret from Vault
 *
 * @param secretId - The vault secret UUID
 * @returns The decrypted secret value
 */
export async function retrieveSecret(secretId: string): Promise<string> {
  const admin = createAdminClient();

  // Query vault.decrypted_secrets - only accessible to service_role
  const { data, error } = await admin
    .from('vault.decrypted_secrets')
    .select('decrypted_secret')
    .eq('id', secretId)
    .single();

  if (error) {
    throw new Error(`Failed to retrieve secret from Vault: ${error.message}`);
  }

  if (!data?.decrypted_secret) {
    throw new Error(`Secret not found: ${secretId}`);
  }

  return data.decrypted_secret;
}

/**
 * Delete a secret from Vault
 *
 * @param secretId - The vault secret UUID to delete
 */
export async function deleteSecret(secretId: string): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin
    .from('vault.secrets')
    .delete()
    .eq('id', secretId);

  if (error) {
    throw new Error(`Failed to delete secret from Vault: ${error.message}`);
  }
}
