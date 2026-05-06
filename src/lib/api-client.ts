import { supabase } from "@/integrations/supabase/client";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// Centralized fetch for backend calls. Adds Supabase apikey + Authorization headers
// (user JWT when logged in, falls back to anon publishable key). The API_BASE_URL
// points to Supabase Edge Functions today and to Cloud Run after the migration —
// callers stay agnostic.
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(options.headers);

  if (SUPABASE_KEY) headers.set("apikey", SUPABASE_KEY);

  const bearer = session?.access_token ?? SUPABASE_KEY;
  if (bearer) headers.set("Authorization", `Bearer ${bearer}`);

  return fetch(`${API_BASE_URL}${path}`, { ...options, headers });
}
