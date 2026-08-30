import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function Card({ className, lift, ...p }: HTMLAttributes<HTMLDivElement> & { lift?: boolean }) {
  return <div className={cn("glass rounded-xl", lift && "lift", className)} {...p} />;
}
export function CardHeader({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center justify-between px-5 pt-4 pb-2", className)} {...p} />;
}
export function CardTitle({ className, ...p }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-semibold tracking-tight", className)} {...p} />;
}
export function CardContent({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5", className)} {...p} />;
}
