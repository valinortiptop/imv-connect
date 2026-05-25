// Server-only admin client. NEVER import from client/browser code.
// File name ending in .server.ts is enforced by the bundler.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./client";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.IMV_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_URL or IMV_SUPABASE_SERVICE_ROLE_KEY in server environment.",
  );
}

export const supabaseAdmin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
