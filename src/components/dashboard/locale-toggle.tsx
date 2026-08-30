"use client";
import { useTransition } from "react";
import { setLocaleAction } from "@/app/locale-actions";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const OPTIONS: Array<{ v: Locale; label: string }> = [{ v: "zh-TW", label: "中文" }, { v: "en", label: "EN" }];

export function LocaleToggle({ locale }: { locale: Locale }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
      {OPTIONS.map((o) => (
        <button key={o.v} type="button" disabled={pending} onClick={() => start(() => setLocaleAction(o.v))}
          className={cn("rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors", locale === o.v ? "bg-accent/20 text-fg" : "text-muted hover:text-fg")}>{o.label}</button>
      ))}
    </div>
  );
}
