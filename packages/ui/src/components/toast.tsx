import { createContext, useCallback, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, XCircle, Info, AlertTriangle, X, Lock, EyeOff, Undo2 } from "lucide-react";

export type ToastVariant = "success" | "error" | "info" | "warning" | "private" | "hidden";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  action?: ToastAction;
  duration?: number; // ms override
}

interface ToastContextValue {
  toast: (input: Omit<Toast, "id">) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_CONFIG: Record<ToastVariant, { icon: React.ElementType; ariaRole: "status" | "alert"; defaultDuration: number }> = {
  success: { icon: CheckCircle2, ariaRole: "status", defaultDuration: 4000 },
  error:   { icon: XCircle,      ariaRole: "alert",  defaultDuration: 6000 },
  warning: { icon: AlertTriangle,ariaRole: "alert",  defaultDuration: 5000 },
  info:    { icon: Info,         ariaRole: "status", defaultDuration: 4000 },
  private: { icon: Lock,         ariaRole: "status", defaultDuration: 4000 },
  hidden:  { icon: EyeOff,       ariaRole: "status", defaultDuration: 4000 },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((input: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2, 9);
    // Normalize legacy variants to primary 4
    let variant: ToastVariant = input.variant ?? "info";
    // Keep private/hidden backward compat but they render as info styling logically
    const full: Toast = { ...input, id, variant };
    // Undo toasts live longer
    if (full.action && !full.duration) {
      full.duration = 8000;
    }
    setToasts((prev) => [...prev, full]);

    const cfg = VARIANT_CONFIG[variant] ?? VARIANT_CONFIG.info;
    const ms = full.duration ?? cfg.defaultDuration;
    const timer = setTimeout(() => dismiss(id), ms);
    // Return cleanup handled via id
    return id;
  }, [dismiss]);

  // Global Escape dismisses topmost toast (a11y)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && toasts.length > 0) {
        const last = toasts[toasts.length - 1];
        if (last) dismiss(last.id);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toasts, dismiss]);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      {createPortal(
        <div
          className="pointer-events-none fixed left-1/2 top-4 z-[100] flex w-[calc(100vw-3rem)] max-w-sm -translate-x-1/2 flex-col items-center gap-2.5 sm:top-6 sm:max-w-sm"
          aria-live="polite"
          aria-atomic="false"
          aria-label="Notifikasi"
        >
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

function ToastItem({ toast: t, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const enter = requestAnimationFrame(() => setVisible(true));
    const cfg = VARIANT_CONFIG[t.variant ?? "info"] ?? VARIANT_CONFIG.info;
    const ms = t.duration ?? cfg.defaultDuration;
    // Start exit animation slightly before actual dismiss
    const leaveTimer = setTimeout(() => setLeaving(true), Math.max(0, ms - 300));
    return () => {
      cancelAnimationFrame(enter);
      clearTimeout(leaveTimer);
    };
  }, [t.duration, t.variant]);

  const cfg = VARIANT_CONFIG[t.variant ?? "info"] ?? VARIANT_CONFIG.info;
  const Icon = cfg.icon;
  const role = t.variant === "error" || t.variant === "warning" ? "alert" : "status";
  const themeBg = "var(--brand-fill, linear-gradient(var(--brand-a, #10b981), var(--brand-a, #10b981)))";

  const handleAction = () => {
    try { t.action?.onClick(); } catch {}
    onDismiss(t.id);
  };

  return (
    <div
      role={role}
      aria-live={role === "alert" ? "assertive" : "polite"}
      aria-atomic="true"
      style={{
        transition: "opacity 300ms ease, transform 300ms ease",
        opacity: visible && !leaving ? 1 : 0,
        transform: visible && !leaving ? "translateY(0)" : "translateY(-10px)",
        backgroundColor: "var(--brand-a, rgb(var(--foreground)))",
        backgroundImage: themeBg,
      }}
      className="pointer-events-auto flex w-full items-start gap-3 rounded-2xl border-0 px-4 py-3.5 text-white shadow-lg shadow-black/20 backdrop-blur"
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-white/90" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug">{t.title}</p>
        {t.description && (
          <p className="mt-1 break-words text-[13px] leading-snug text-white/80">{t.description}</p>
        )}
        {t.action && (
          <button
            type="button"
            onClick={handleAction}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/20 hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brand-a)]"
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
            {t.action.label}
          </button>
        )}
      </div>
      <button
        ref={closeBtnRef}
        type="button"
        onClick={() => onDismiss(t.id)}
        aria-label="Tutup notifikasi"
        className="mt-0.5 grid h-7 w-7 place-items-center rounded-full text-white/60 transition hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
}
