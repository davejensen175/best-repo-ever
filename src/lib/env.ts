// Each variable is read by its full name so Next.js can inline NEXT_PUBLIC_ values
// into the browser bundle. A dynamic `process.env[name]` lookup would be undefined there.
const required = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

/** Throws one error naming every required environment variable that is missing or empty. */
export function assertEnv() {
  const missing = Object.entries(required)
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. ` +
        "Copy .env.example to .env.local and fill in the values (see README, step 2).",
    );
  }
}

/** Supabase project URL and anon key, checked on first use. */
export function supabaseEnv() {
  assertEnv();
  return {
    url: required.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: required.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  };
}
