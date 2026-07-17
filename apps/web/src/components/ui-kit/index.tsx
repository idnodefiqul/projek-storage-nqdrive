import * as React from "react";
import { cn } from "@nqdrive/ui";

export function PageHeader({
  eyebrow,
  icon: Icon,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[rgb(var(--ink-500))]">{eyebrow}</p>}
        <h1 className="mt-1 flex items-center gap-2.5 text-2xl font-bold tracking-tight text-[rgb(var(--foreground))] sm:text-3xl">
          {Icon && <Icon className="h-6 w-6 text-[var(--brand-a)]" />}
          {title}
        </h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-[rgb(var(--ink-500))]">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionCard({
  title,
  icon: Icon,
  children,
  className,
  bodyClassName,
  action,
}: {
  title?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn("app-card overflow-hidden", className)}>
      {title && (
        <div className="flex items-center justify-between border-b border-[rgb(var(--border-subtle))] px-5 py-3">
          <h3 className="flex items-center gap-2 text-sm font-bold text-[rgb(var(--foreground))]">
            {Icon && <Icon className="h-4 w-4 text-[var(--brand-a)]" />}
            {title}
          </h3>
          {action}
        </div>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "brand" | "violet" | "emerald" | "amber" | "sky";
  hint?: string;
}) {
  return (
    <div className="app-card p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[rgb(var(--ink-500))]">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-[rgb(var(--ink-500))]" />}
      </div>
      <p className="mt-3 font-mono text-2xl font-bold text-[rgb(var(--foreground))]">{value}</p>
      {hint && <p className="mt-1 text-xs text-[rgb(var(--ink-500))]">{hint}</p>}
    </div>
  );
}

export const CHART_COLORS = {
  brand: "var(--color-brand-500)",
  brandSoft: "var(--color-brand-300)",
  accent: "var(--color-accent-500)",
  muted: "rgb(var(--surface-muted))",
  grid: "rgba(224,229,236,0.8)",
  ink: "rgb(var(--ink-500))",
};

export function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] p-3 shadow-lg">
      <p className="text-xs font-bold text-[rgb(var(--foreground))]">{label}</p>
      <div className="mt-1 space-y-1">
        {payload.map((p, i) => (
          <p key={i} className="text-xs text-[rgb(var(--ink-500))]">
            <span className="font-medium" style={{ color: p.color }}>{p.name}:</span> {p.value}
          </p>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      {Icon && (
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[rgb(var(--surface-muted))] ring-1 ring-[rgb(var(--border-subtle))]">
          <Icon className="h-6 w-6 text-[rgb(var(--ink-500))]" />
        </span>
      )}
      <h3 className="text-sm font-bold text-[rgb(var(--foreground))]">{title}</h3>
      {description && <p className="max-w-sm text-sm text-[rgb(var(--ink-500))]">{description}</p>}
      {action}
    </div>
  );
}
