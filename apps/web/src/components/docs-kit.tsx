import { useEffect, useState, type ReactNode, type ComponentType } from "react";
import { Link } from "@tanstack/react-router";
import {
  Copy, Info, AlertTriangle, CheckCircle2, FileJson, ArrowLeft,
} from "lucide-react";
import { useToast } from "@nqdrive/ui";
import { PageTransition } from "./page-transition";
import { PageHeader } from "./ui-kit";

// ─── Building blocks (dipakai semua halaman dokumentasi) ──────────────────────

export function StepNumber({ n }: { n: number }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-sm font-bold text-white shadow-sm shadow-brand-500/30">
      {n}
    </div>
  );
}

export function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-4">
      <StepNumber n={n} />
      <div className="min-w-0 flex-1">
        <h3 className="mb-2 text-base font-semibold text-[rgb(var(--foreground))]">{title}</h3>
        <div className="space-y-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{children}</div>
      </div>
    </div>
  );
}

export function Callout({
  variant = "info",
  children,
}: {
  variant?: "info" | "warning" | "success";
  children: ReactNode;
}) {
  const styles = {
    info: "border-brand-200 bg-brand-50 text-brand-800 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300",
    warning: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  }[variant];
  const Icon = variant === "warning" ? AlertTriangle : variant === "success" ? CheckCircle2 : Info;
  return (
    <div className={`flex gap-3 rounded-xl border p-4 text-sm ${styles}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

export function CodeBlock({ code, filename }: { code: string; filename?: string }) {
  const { toast } = useToast();
  const copy = () => {
    navigator.clipboard.writeText(code);
    toast({ title: "Tersalin ke clipboard", variant: "success" });
  };
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-900 dark:border-zinc-800">
      {filename && (
        <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-950/60 px-4 py-2 text-xs font-medium text-zinc-400">
          <FileJson className="h-3.5 w-3.5 text-brand-400" />
          {filename}
        </div>
      )}
      <div className="relative">
        <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-zinc-100">
          <code className="font-mono">{code}</code>
        </pre>
        <button
          onClick={copy}
          className="absolute right-2 top-2 rounded-md bg-zinc-800 p-1.5 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white"
          aria-label="Salin"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Inline code chip. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
      {children}
    </code>
  );
}

export function Section({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      {children}
    </section>
  );
}

export function SectionHeading({ icon: Icon, children }: { icon: ComponentType<{ className?: string }>; children: ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-[rgb(var(--foreground))]">
      <Icon className="h-4 w-4 text-brand-500" /> {children}
    </h2>
  );
}

// ─── DocShell: header + TOC scroll-spy (desktop) + pill nav (mobile) ───────────

export interface DocNavItem {
  id: string;
  label: string;
}

export function DocShell({
  eyebrow,
  title,
  description,
  icon,
  nav,
  children,
  backLabel = "Semua Dokumentasi",
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  nav: DocNavItem[];
  children: ReactNode;
  backLabel?: string;
}) {
  const [active, setActive] = useState(nav[0]?.id ?? "");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 }
    );
    nav.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [nav]);

  return (
    <PageTransition>
      <div className="flex flex-col gap-6">
        <div>
          <Link
            to="/dashboard/documentation"
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 transition-colors hover:text-brand-600 dark:text-zinc-400 dark:hover:text-brand-400"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {backLabel}
          </Link>
          <PageHeader eyebrow={eyebrow} icon={icon} title={title} description={description} />
        </div>

        {/* Mobile: pill nav horizontal (scrollable) */}
        <nav className="-mx-1 flex gap-1.5 overflow-x-auto pb-1 lg:hidden no-scrollbar">
          {nav.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                active === item.id
                  ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400"
                  : "border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"
              }`}
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Layout: TOC + content */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px_1fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-6">
              <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                Daftar Isi
              </p>
              <nav className="flex flex-col gap-0.5">
                {nav.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                      active === item.id
                        ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-400"
                        : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
                    }`}
                  >
                    {item.label}
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          <div className="min-w-0 space-y-10">{children}</div>
        </div>
      </div>
    </PageTransition>
  );
}
