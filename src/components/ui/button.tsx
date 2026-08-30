import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg";
const variants = {
  primary: "bg-accent text-white hover:bg-accent/90 hover:shadow-[0_6px_20px_rgba(91,140,255,0.35)]",
  secondary: "bg-white/8 text-fg hover:bg-white/12 border border-white/10",
  ghost: "text-muted hover:text-fg hover:bg-white/5",
  danger: "bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25",
  success: "bg-engage/15 text-engage border border-engage/30 hover:bg-engage/25",
} as const;

export function Button({ variant = "secondary", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return <button className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-[background-color,transform,box-shadow] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100", focusRing, variants[variant], className)} {...p} />;
}
