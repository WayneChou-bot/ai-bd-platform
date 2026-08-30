"use client";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "./button";
import type { ComponentProps } from "react";

/** Button that shows a spinner while its parent <form action> is pending. */
export function SubmitButton({ children, pendingText, disabled, ...p }: ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending} aria-busy={pending} {...p}>
      {pending ? <><Loader2 size={14} className="animate-spin" /> {pendingText ?? children}</> : children}
    </Button>
  );
}
