import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config.js";

let cached: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (!cached) {
    cached = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return cached;
}
