import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "@/lib/env";

/** Supabase client for Server Components, Server Actions and Route Handlers. */
export async function createClient() {
  const { url, anonKey } = supabaseEnv();
  const cookieStore = await cookies();
  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // The proxy refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  );
}

/** Returns the signed-in user's id, verified against the JWT, or null. */
export async function getUserId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return (data?.claims.sub as string | undefined) ?? null;
}
