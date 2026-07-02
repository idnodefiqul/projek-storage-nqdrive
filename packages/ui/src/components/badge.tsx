import { type HTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
  {
    variants: {
      variant: {
        default:     "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-200 dark:ring-1 dark:ring-brand-500/30",
        success:     "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200 dark:ring-1 dark:ring-emerald-500/30",
        warning:     "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200 dark:ring-1 dark:ring-amber-500/30",
        destructive: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-200 dark:ring-1 dark:ring-red-500/30",
        neutral:     "bg-zinc-100 text-zinc-600 dark:bg-zinc-700/60 dark:text-zinc-200 dark:ring-1 dark:ring-zinc-600/40",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(({ className, variant, ...props }, ref) => (
  <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
));
Badge.displayName = "Badge";
