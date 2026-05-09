import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Service-role Supabase client. **BYPASSES RLS.** Use only for:
 *  - Cron jobs (slot hold cleanup, payout aggregation)
 *  - Admin operations explicitly authorized at the business-action level
 *  - Webhook handlers verifying signed payloads
 *
 * NEVER import this from a "use client" file. The "server-only" import will
 * cause a build error if attempted.
 */
export function createServiceClient() {
  return createSupabaseClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
