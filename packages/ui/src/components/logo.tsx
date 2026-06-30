import { type SVGProps } from "react";

/**
 * NQDRIVE logo mark — tiga kotak rounded yang overlap, melambangkan
 * multiple Google Drive accounts yang digabung ke satu virtual storage.
 *
 * PENTING: Pakai fill inline (bukan Tailwind fill-brand-* class) karena
 * Tailwind v4 tidak otomatis generate utility fill-* untuk custom colors.
 * CSS var --color-brand-* tersedia global dari globals.css @theme.
 */
export function NqdriveLogo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <rect x="2"  y="14" width="16" height="16" rx="5" fill="var(--color-brand-200)" />
      <rect x="12" y="8"  width="16" height="16" rx="5" fill="var(--color-brand-400)" />
      <rect x="22" y="14" width="16" height="16" rx="5" fill="var(--color-brand-600)" />
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
