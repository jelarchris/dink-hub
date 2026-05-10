"use client";

import { useEffect } from "react";

/**
 * Supabase recovery emails arrive at the Site URL with `type=recovery` in the
 * URL hash. When the link's `redirect_to` falls outside the allowlist (e.g.
 * stale emails baked with localhost), Supabase silently drops it and lands
 * the user on `/`. This component detects that case anywhere in the app and
 * forwards them to `/reset-password` with the recovery hash preserved so
 * `supabase.auth.getUser()` can install the session there.
 */
export function RecoveryHashRedirect() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return;
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const type = params.get("type");
    const isRecovery =
      type === "recovery" ||
      params.has("error_code") ||
      params.has("error_description");
    if (!isRecovery) return;
    if (window.location.pathname === "/reset-password") return;
    window.location.replace(`/reset-password${hash}`);
  }, []);

  return null;
}
