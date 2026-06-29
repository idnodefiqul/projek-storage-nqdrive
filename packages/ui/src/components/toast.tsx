import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { cn } from "../lib/utils";

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: "success" | "error" | "info";
}

interface ToastContextValue {
  toast: (input: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_ICON = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const VARIANT_CLASSES = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  error: "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
  info: "border-zinc-200 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
};

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
        <div className="fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
          {toasts.map((t) => {
            const Icon = VARIANT_ICON[t.variant ?? "info"];
            return (
              <div
                key={t.id}
                role="status"
                className={cn(
                  "flex items-start gap-3 rounded-card border p-4 shadow-lg",
                  VARIANT_CLASSES[t.variant ?? "info"]
                )}
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{t.title}</p>
                  {t.description && <p className="mt-0.5 text-sm opacity-80">{t.description}</p>}
                </div>
                <button onClick={() => dismiss(t.id)} aria-label="Tutup notifikasi">
                  <X className="h-4 w-4 opacity-60 hover:opacity-100" />
                </button>
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
}
