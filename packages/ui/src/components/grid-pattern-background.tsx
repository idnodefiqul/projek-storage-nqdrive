"use client";

import { GridPattern } from "./grid-pattern";
import { cn } from "../lib/utils";

interface GridPatternBackgroundProps {
  className?: string;
}

/**
 * Lapisan background Grid Pattern (Magic UI) yang konsisten untuk seluruh halaman.
 * Mendukung light & dark mode. Letakkan di dalam container yang berposisi `relative`
 * (atau gunakan className `fixed inset-0` untuk menempel di viewport).
 */
export function GridPatternBackground({ className }: GridPatternBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className
      )}
    >
      <GridPattern
        width={32}
        height={32}
        className="[mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_75%)] text-slate-300 dark:text-zinc-700"
        strokeDasharray="2 2"
      />
    </div>
  );
}
