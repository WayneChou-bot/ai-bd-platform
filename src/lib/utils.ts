import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...i: ClassValue[]) => twMerge(clsx(i));

export const fmtInt = (n: number) => new Intl.NumberFormat("en-US").format(n);

/** Real addresses never render in full on read-only status pages (§43 spirit):
 *  "someone@example.com" → "s•••••••@example.com". Non-emails pass through. */
export const maskEmail = (e: string): string => {
  const at = e.indexOf("@");
  return at > 0 ? `${e[0]}•••••••${e.slice(at)}` : e;
};
export const relTime = (iso: string, now = new Date()) => {
  const diff = now.getTime() - new Date(iso).getTime();
  if (diff < 0) return iso.slice(0, 10);
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(diff / 60_000))}m`;
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};
