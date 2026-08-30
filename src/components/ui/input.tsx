import { cn } from "@/lib/utils";
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const base = "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-fg placeholder:text-muted/70 focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20";

export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input className={cn(base, className)} {...p} />;
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={cn(base, "min-h-20 font-sans", className)} {...p} />;
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select className={cn(base, "bg-bg-elev", className)} {...p} />;
export const Label = ({ children, hint }: { children: React.ReactNode; hint?: string }) => (
  <label className="mb-1 block text-xs font-medium text-muted">{children}{hint && <span className="ml-1 font-normal text-muted/60">— {hint}</span>}</label>
);
/** Wrapping <label> gives implicit control association — screen readers
 *  announce the label without needing htmlFor/id plumbing (a11y review). */
export const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="mb-1 block text-xs font-medium text-muted">{label}{hint && <span className="ml-1 font-normal text-muted/60">— {hint}</span>}</span>
    {children}
  </label>
);
