// Supabase client factories. Safe to import even when Supabase is not
// configured — callers check isSupabaseConfigured() first.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && (serviceKey || anonKey));
}

// Server-side client with the service role — bypasses RLS. Never expose.
let _admin: SupabaseClient | null = null;
export function supabaseAdmin(): SupabaseClient {
  if (!url || !serviceKey) {
    throw new Error("Supabase service role not configured");
  }
  if (!_admin) {
    _admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}

// Browser client with the anon key — used for Realtime subscriptions.
export function supabaseBrowser(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  return createClient(url, anonKey);
}
