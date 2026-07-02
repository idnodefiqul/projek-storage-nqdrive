import { type SVGProps } from "react";

/**
 * NQDRIVE logo mark — tiga kotak rounded yang overlap, melambangkan
 * multiple Google Drive accounts yang digabung ke satu virtual storage.
 *
 * PENTING: Pakai fill inline (bukan Tailwind fill-brand-* class) karena
 * Tailwind v4 tidak otomatis generate utility fill-* untuk custom colors.
 * CSS var --color-brand-* tersedia global dari globals.css @theme.
 */
export interface NqdriveLogoProps extends SVGProps<SVGSVGElement> {
  customLogo?: string;
}

export function NqdriveLogo({ className, customLogo, ...props }: NqdriveLogoProps) {
  if (customLogo) {
    return (
      <img
        src={customLogo}
        alt="Site Logo"
        className={className}
        style={{ objectFit: "contain" }}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <defs>
        <linearGradient id="nq-logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--color-brand-500, #10b981)" />
          <stop offset="100%" stopColor="var(--color-brand-600, #3b82f6)" />
        </linearGradient>
      </defs>
      
      {/* Huruf N */}
      <path
        d="M10 28V12L20 28V12"
        stroke="url(#nq-logo-grad)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      
      {/* Huruf Q */}
      <circle
        cx="25"
        cy="20"
        r="7"
        stroke="url(#nq-logo-grad)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M30 25L35 30"
        stroke="url(#nq-logo-grad)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function NqdriveLogoWithWordmark({ className }: { className?: string }) {
  return (
    <div className={className} style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
      <NqdriveLogo className="h-8 w-8" />
      <span className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
        NQ<span className="text-brand-600 dark:text-brand-400">DRIVE</span>
      </span>
    </div>
  );
}
