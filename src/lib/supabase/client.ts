import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "@/lib/env";

/** Supabase client for Client Components (used for direct-to-storage uploads). */
export function createClient() {
  const { url, anonKey } = supabaseEnv();
  return createBrowserClient(url, anonKey);
}
