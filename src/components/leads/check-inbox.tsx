"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Inbox, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CheckInboxButton({ label }: { label: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  const run = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/inbound/poll", { method: "POST" });
      const j = await r.json() as { checked: number; imported: number; unmatched: number; errors: string[] };
      setMsg(j.errors.length ? j.errors[0] : `${j.checked} checked · ${j.imported} imported · ${j.unmatched} ignored (not ours)`);
      router.refresh();
    } finally { setBusy(false); }
  };
  return <span className="inline-flex items-center gap-2"><Button type="button" onClick={run} disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Inbox size={14} />} {label}</Button>{msg && <span className="text-xs text-muted">{msg}</span>}</span>;
}
