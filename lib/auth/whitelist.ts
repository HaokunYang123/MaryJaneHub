/**
 * Email Whitelist Functions
 *
 * Functions for managing the email whitelist
 */

import { getSupabase } from "@/lib/supabase/client";
import { UserRole, AUTH_CONFIG } from "./config";

export interface WhitelistEntry {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  created_at: string;
  created_by: string | null;
  is_active: boolean;
}

export interface WhitelistResult {
  success: boolean;
  data?: WhitelistEntry | WhitelistEntry[];
  error?: string;
}

/**
 * Check if an email is whitelisted
 */
export async function isEmailWhitelisted(email: string): Promise<boolean> {
  const supabase = getSupabase();

  const { data, error } = await supabase.rpc("is_email_whitelisted", {
    check_email: email,
  });

  if (error) {
    console.error("Error checking whitelist:", error);
    return false;
  }

  return data === true;
}

/**
 * Get the role for a whitelisted email
 */
export async function getWhitelistRole(email: string): Promise<UserRole | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase.rpc("get_whitelist_role", {
    check_email: email,
  });

  if (error) {
    console.error("Error getting whitelist role:", error);
    return null;
  }

  return data as UserRole | null;
}

/**
 * Get all whitelisted emails (admin only)
 */
export async function getWhitelist(): Promise<WhitelistResult> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("auth_whitelist")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: data as WhitelistEntry[] };
}

/**
 * Add an email to the whitelist (admin only)
 */
export async function addToWhitelist(
  email: string,
  name?: string,
  role: UserRole = AUTH_CONFIG.roles.USER
): Promise<WhitelistResult> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("auth_whitelist")
    .insert({
      email: email.toLowerCase(),
      name,
      role,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Email already exists in whitelist" };
    }
    return { success: false, error: error.message };
  }

  return { success: true, data: data as WhitelistEntry };
}

/**
 * Update a whitelist entry (admin only)
 */
export async function updateWhitelistEntry(
  id: string,
  updates: Partial<Pick<WhitelistEntry, "name" | "role" | "is_active">>
): Promise<WhitelistResult> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("auth_whitelist")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: data as WhitelistEntry };
}

/**
 * Remove an email from the whitelist (admin only)
 * Note: This soft-deletes by setting is_active to false
 */
export async function removeFromWhitelist(id: string): Promise<WhitelistResult> {
  return updateWhitelistEntry(id, { is_active: false });
}

/**
 * Hard delete a whitelist entry (admin only)
 */
export async function deleteWhitelistEntry(id: string): Promise<WhitelistResult> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from("auth_whitelist")
    .delete()
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
