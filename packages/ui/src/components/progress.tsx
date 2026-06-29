import { type HTMLAttributes } from "react";
import { cn } from "../lib/utils";

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value: number; // 0-100
  indicatorClassName?: string;
}

export function Progress({ value, className, indicatorClassName, ...props }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800", className)}
      {...props}
    >
      <div
        className={cn("h-full rounded-full bg-brand-500 transition-all duration-300", indicatorClassName)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
