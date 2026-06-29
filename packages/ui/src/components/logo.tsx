import { type SVGProps } from "react";

/**
 * NQDRIVE logo mark — three overlapping rounded shapes converging into one, representing
 * multiple Google Drive accounts being unified into a single virtual storage pool. Built as
 * a plain SVG (no icon font, no emoji) so it stays crisp at any size and themeable via the
 * brand color tokens, consistent with the rest of the design system.
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
      <rect x="2" y="14" width="16" height="16" rx="5" className="fill-brand-200 dark:fill-brand-800" />
      <rect x="12" y="8" width="16" height="16" rx="5" className="fill-brand-400 dark:fill-brand-600" />
      <rect x="22" y="14" width="16" height="16" rx="5" className="fill-brand-600 dark:fill-brand-400" />
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
