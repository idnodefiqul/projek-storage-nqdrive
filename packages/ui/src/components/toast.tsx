import { createContext, useCallback, useContext, useState, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, XCircle, Info, X, Lock, EyeOff } from "lucide-react";
import { cn } from "../lib/utils";

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: "success" | "error" | "info" | "warning" | "private" | "hidden";
}

interface ToastContextValue {
  toast: (input: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_CONFIG: Record<
  NonNullable<Toast["variant"]>,
  { icon: React.ElementType; classes: string }
> = {
  success: {
    icon: CheckCircle2,
    classes:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  },
  error: {
    icon: XCircle,
    classes:
      "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
  },
  info: {
    icon: Info,
    classes:
      "border-zinc-200 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
  },
  warning: {
    icon: Info,
    classes:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  },
  private: {
    icon: Lock,
    classes:
      "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  },
  hidden: {
    icon: EyeOff,
    classes:
      "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200",
  },
};

const DEFAULT_VARIANT = VARIANT_CONFIG.info;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (input: Omit<Toast, "id">) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { ...input, id }]);
      setTimeout(() => dismiss(id), 5000);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {createPortal(
        <div
          className="fixed left-1/2 top-3 z-[100] flex w-[calc(100vw-1.5rem)] max-w-[22rem] -translate-x-1/2 flex-col items-center gap-2 sm:top-5 sm:max-w-md"
          aria-live="polite"
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

  useEffect(() => {
    const enter = requestAnimationFrame(() => setVisible(true));
    const leaveTimer = setTimeout(() => setLeaving(true), 4700);
    return () => {
      cancelAnimationFrame(enter);
      clearTimeout(leaveTimer);
    };
  }, []);

  const config = t.variant ? (VARIANT_CONFIG[t.variant] ?? DEFAULT_VARIANT) : DEFAULT_VARIANT;
  const Icon = config.icon;

  return (
    <div
      role="status"
      style={{
        transition: "opacity 300ms ease, transform 300ms ease",
        opacity: visible && !leaving ? 1 : 0,
        transform: visible && !leaving ? "translateY(0)" : "translateY(-10px)",
      }}
      className={cn(
        "flex w-full items-start gap-2 rounded-xl border p-3 shadow-lg shadow-black/10 backdrop-blur sm:gap-3 sm:p-4",
        config.classes
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold leading-snug sm:text-sm">{t.title}</p>
        {t.description && (
          <p className="mt-0.5 break-words text-xs leading-snug opacity-75 sm:text-sm">{t.description}</p>
        )}
      </div>
      <button
        onClick={() => onDismiss(t.id)}
        aria-label="Tutup notifikasi"
        className="mt-0.5 shrink-0 opacity-50 transition-opacity hover:opacity-100"
      >
        <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
}
