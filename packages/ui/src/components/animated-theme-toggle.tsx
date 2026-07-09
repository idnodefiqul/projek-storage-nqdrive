"use client";

import { Moon, Sun } from "lucide-react";
import { cn } from "../lib/utils";

interface AnimatedThemeToggleProps {
  theme: "light" | "dark";
  onToggle: () => void;
  className?: string;
}

export function AnimatedThemeToggle({
  theme,
  onToggle,
  className,
}: AnimatedThemeToggleProps) {
  const isLight = theme === "light";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="Toggle tema"
      className={cn(
        "relative flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-900 shadow-sm transition-colors hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:hover:bg-neutral-800",
        className
      )}
    >
      <span
        className="absolute transition-transform duration-300 ease-in-out"
        style={{
          transform: isLight
            ? "rotate(0deg) scale(1)"
            : "rotate(180deg) scale(0)",
        }}
      >
        <Sun className="h-4 w-4" />
      </span>
      <span
        className="absolute transition-transform duration-300 ease-in-out"
        style={{
          transform: isLight
            ? "rotate(-180deg) scale(0)"
            : "rotate(0deg) scale(1)",
        }}
      >
        <Moon className="h-4 w-4" />
      </span>
    </button>
  );
}
