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

// Default fallback
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
          className="fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0"
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
    // mount → slide in
    const enter = requestAnimationFrame(() => setVisible(true));
    // auto dismiss: start leave animation 300ms sebelum benar-benar dihapus
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
        transform: visible && !leaving ? "translateY(0)" : "translateY(12px)",
      }}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4 shadow-lg shadow-black/10",
        config.classes
      )}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-snug">{t.title}</p>
        {t.description && (
          <p className="mt-0.5 text-sm opacity-75 leading-snug break-words">{t.description}</p>
        )}
      </div>
      <button
        onClick={() => onDismiss(t.id)}
        aria-label="Tutup notifikasi"
        className="shrink-0 opacity-50 hover:opacity-100 transition-opacity mt-0.5"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
}
