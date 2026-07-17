import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--surface))] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // default: brand gradient
        default: "bg-gradient-to-r from-brand-500 to-brand-600 text-white hover:from-brand-400 hover:to-brand-500 shadow-sm shadow-brand-500/25",
        secondary:
          "bg-[rgb(var(--surface-muted))] text-[rgb(var(--foreground))] hover:brightness-95 dark:hover:brightness-110",
        // outline: border + surface token
        outline:
          "border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] text-[rgb(var(--foreground))] hover:border-brand-300 hover:text-brand-600 dark:hover:text-brand-300",
        // ghost: teks netral
        ghost:
          "text-[rgb(var(--ink-500))] hover:bg-[rgb(var(--surface-muted))] hover:text-[rgb(var(--foreground))]",
        destructive: "bg-red-600 text-white hover:bg-red-700 shadow-sm shadow-red-600/25",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-9 px-3 text-sm",
        lg: "h-11 px-6",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
);
Button.displayName = "Button";
