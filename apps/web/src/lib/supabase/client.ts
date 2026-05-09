import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

/**
 * Browser-side Supabase client. Safe to import from "use client" components.
 * Uses the public anon key + RLS policies for security.
 */
export function createClient() {
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
