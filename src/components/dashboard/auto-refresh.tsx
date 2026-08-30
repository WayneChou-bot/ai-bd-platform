"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-fetches server data on an interval so background writes appear without a
 * manual reload. When `poke` is set (LIVE + gmail), it POSTs that URL first —
 * so on serverless hosts (Vercel) inbox polling runs whenever the page is open,
 * with no long-lived process needed.
 */
export function AutoRefresh({ everyMs = 5000, enabled = true, poke }: { everyMs?: number; enabled?: boolean; poke?: string }) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    let busy = false;
    const id = setInterval(async () => {
      if (document.visibilityState !== "visible" || busy) return;
      busy = true;
      try { if (poke) await fetch(poke, { method: "POST" }).catch(() => {}); router.refresh(); } finally { busy = false; }
    }, everyMs);
    return () => clearInterval(id);
  }, [router, everyMs, enabled, poke]);
  return null;
}
