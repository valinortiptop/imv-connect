import { createClient } from "@supabase/supabase-js";

// Permissive Database type until generated. Allows any table/RPC name + payload.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ??
  (typeof process !== "undefined" ? process.env.SUPABASE_URL : undefined);

const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  (typeof process !== "undefined" ? process.env.SUPABASE_PUBLISHABLE_KEY : undefined);

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

if (!isSupabaseConfigured && typeof window !== "undefined") {
  console.warn(
    "[IMV] VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY missing. Copy .env.example to .env.",
  );
}

// Safe placeholders so module import doesn't crash when .env is empty.
// Any query against them will fail at runtime, which we surface in the UI.
export const supabase = createClient<Database>(
  SUPABASE_URL ?? "https://placeholder.supabase.co",
  SUPABASE_PUBLISHABLE_KEY ?? "placeholder-anon-key",
  {
    auth: {
      persistSession: isSupabaseConfigured,
      autoRefreshToken: isSupabaseConfigured,
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
    },
  },
);
