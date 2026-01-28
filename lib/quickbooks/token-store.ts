import { getSupabase } from "../supabase/client.js";
import type { QBTokens } from "./auth.js";

/**
 * Token record as stored in Supabase
 */
export interface QBTokenRecord {
  id: string;
  realm_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Save QuickBooks tokens to Supabase
 *
 * Uses upsert to handle both new connections and token refreshes.
 * Only one set of tokens is stored (single-tenant design).
 */
export async function saveTokens(tokens: QBTokens): Promise<boolean> {
  const supabase = getSupabase();

  try {
    const { error } = await supabase
      .from("qb_tokens")
      .upsert(
        {
          id: "default", // Single-tenant: always use same ID
          realm_id: tokens.realm_id,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: tokens.expires_at,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "id",
        }
      );

    if (error) {
      console.error(`Failed to save QB tokens: ${error.message}`);
      return false;
    }

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`Failed to save QB tokens: ${errorMessage}`);
    return false;
  }
}

/**
 * Retrieve QuickBooks tokens from Supabase
 *
 * @returns Token data or null if no tokens are stored
 */
export async function getTokens(): Promise<QBTokens | null> {
  const supabase = getSupabase();

  try {
    const { data, error } = await supabase
      .from("qb_tokens")
      .select("*")
      .eq("id", "default")
      .single<QBTokenRecord>();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows found - not connected yet
        return null;
      }
      console.error(`Failed to get QB tokens: ${error.message}`);
      return null;
    }

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      realm_id: data.realm_id,
      expires_at: data.expires_at,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`Failed to get QB tokens: ${errorMessage}`);
    return null;
  }
}

/**
 * Delete stored QuickBooks tokens (disconnect)
 */
export async function deleteTokens(): Promise<boolean> {
  const supabase = getSupabase();

  try {
    const { error } = await supabase
      .from("qb_tokens")
      .delete()
      .eq("id", "default");

    if (error) {
      console.error(`Failed to delete QB tokens: ${error.message}`);
      return false;
    }

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`Failed to delete QB tokens: ${errorMessage}`);
    return false;
  }
}

/**
 * Check if QuickBooks is connected
 */
export async function isConnected(): Promise<boolean> {
  const tokens = await getTokens();
  return tokens !== null;
}
