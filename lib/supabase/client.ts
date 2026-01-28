import { createClient, SupabaseClient } from "@supabase/supabase-js";

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL environment variable is required");
  }
  if (!supabaseKey) {
    throw new Error("SUPABASE_SERVICE_KEY environment variable is required");
  }

  return { supabaseUrl, supabaseKey };
}

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    const { supabaseUrl, supabaseKey } = getSupabaseConfig();
    supabaseInstance = createClient(supabaseUrl, supabaseKey);
  }
  return supabaseInstance;
}
