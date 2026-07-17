import { type InputHTMLAttributes, forwardRef } from "react";
import { cn } from "../lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-xl border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--ink-500))] transition focus-visible:border-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
