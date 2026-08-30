import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

const tones = {
  neutral: "bg-white/5 text-fg/80 border-white/10",
  discover: "bg-discover/15 text-discover border-discover/30",
  research: "bg-research/15 text-research border-research/30",
  qualify: "bg-qualify/15 text-qualify border-qualify/30",
  engage: "bg-engage/15 text-engage border-engage/30",
  reply: "bg-reply/15 text-reply border-reply/30",
  learn: "bg-learn/15 text-learn border-learn/30",
  danger: "bg-danger/15 text-danger border-danger/30",
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", className, ...p }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium leading-4", tones[tone], className)} {...p} />;
}
