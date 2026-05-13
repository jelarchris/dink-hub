"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ intervalMs = 10_000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    function refresh() {
      if (document.visibilityState !== "visible") return;
      startTransition(() => {
        router.refresh();
      });
    }

    const intervalId = window.setInterval(refresh, intervalMs);
    return () => window.clearInterval(intervalId);
  }, [intervalMs, router, startTransition]);

  return null;
}
