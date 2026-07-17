import { type ReactNode, useEffect, useId, useRef, useCallback, createContext, useContext, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/utils";

interface DialogContextValue {
  titleId: string;
  descriptionId: string;
  setTitleId: (id: string) => void;
  setDescriptionId: (id: string) => void;
  close: () => void;
}

const DialogContext = createContext<DialogContextValue | null>(null);

function useDialogContext() {
  return useContext(DialogContext);
}

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    if (el.hasAttribute("disabled")) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return el.getClientRects().length > 0 || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
  });
}

/**
 * Lightweight modal dialog with full WCAG 2.1 a11y:
 * - focus trap (Tab / Shift+Tab)
 * - Escape closes
 * - restore focus to trigger on close
 * - aria-labelledby → DialogTitle id
 * - aria-describedby → DialogDescription id
 * - body scroll lock
 * - autoFocus first focusable
 */
export function Dialog({ open, onOpenChange, children, className }: DialogProps) {
  const baseId = useId();
  const titleIdRef = useRef<string | null>(null);
  const descIdRef = useRef<string | null>(null);
  const [titleIdState, setTitleIdState] = useState<string | null>(null);
  const [descIdState, setDescIdState] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previousActiveRef = useRef<HTMLElement | null>(null);
  const dialogId = `dialog-${baseId}`;

  const setTitleId = useCallback((id: string) => {
    titleIdRef.current = id;
    setTitleIdState(id);
  }, []);

  const setDescriptionId = useCallback((id: string) => {
    descIdRef.current = id;
    setDescIdState(id);
  }, []);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  // Save previously focused element + body scroll lock
  useEffect(() => {
    if (!open) return;
    previousActiveRef.current = document.activeElement as HTMLElement | null;
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    html.style.overflow = "hidden";

    // Auto focus first focusable (RAF after portal mount)
    const raf = requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      const focusable = getFocusable(container);
      if (focusable.length > 0) {
        focusable[0]?.focus();
      } else {
        container.focus();
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      html.style.overflow = prevOverflow;
      // Restore focus with micro-delay so DOM transitions settle
      const prev = previousActiveRef.current;
      if (prev) {
        setTimeout(() => {
          try {
            prev.focus();
          } catch {}
        }, 0);
      }
    };
  }, [open]);

  // Keyboard: Escape + Tab trap
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const container = containerRef.current;
      if (!container) return;

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onOpenChange(false);
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = getFocusable(container);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey) {
        if (active === first || !container.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [open, onOpenChange]);

  const ctxValue: DialogContextValue = {
    titleId: titleIdState ?? `${dialogId}-title`,
    descriptionId: descIdState ?? `${dialogId}-desc`,
    setTitleId,
    setDescriptionId,
    close,
  };

  // Build aria attributes based on what is actually rendered
  const hasTitle = !!titleIdState;
  const hasDesc = !!descIdState;

  if (!open) return null;

  return createPortal(
    <DialogContext.Provider value={ctxValue}>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm"
          onClick={() => onOpenChange(false)}
          aria-hidden="true"
        />
        <div
          id={dialogId}
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={hasTitle ? titleIdState! : undefined}
          aria-describedby={hasDesc ? descIdState! : undefined}
          tabIndex={-1}
          className={cn(
            "relative z-10 w-full max-w-md rounded-card border border-zinc-200 bg-white p-6 shadow-lg dark:border-zinc-800 dark:bg-zinc-900",
            "max-h-[90vh] overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
            className
          )}
        >
          {children}
        </div>
      </div>
    </DialogContext.Provider>,
    document.body
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4 flex flex-col gap-1", className)} {...props} />;
}

export function DialogTitle({ className, id, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  const ctx = useDialogContext();
  const autoId = useId();
  const resolvedId = id ?? ctx?.titleId ?? `dialog-title-${autoId}`;

  useEffect(() => {
    if (ctx) ctx.setTitleId(resolvedId);
  }, [ctx, resolvedId]);

  return <h2 id={resolvedId} className={cn("text-lg font-semibold text-zinc-900 dark:text-zinc-100", className)} {...props} />;
}

export function DialogDescription({ className, id, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  const ctx = useDialogContext();
  const autoId = useId();
  const resolvedId = id ?? ctx?.descriptionId ?? `dialog-desc-${autoId}`;

  useEffect(() => {
    if (ctx) ctx.setDescriptionId(resolvedId);
  }, [ctx, resolvedId]);

  return <p id={resolvedId} className={cn("text-sm text-zinc-500 dark:text-zinc-400", className)} {...props} />;
}

export function DialogContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-4", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-6 flex justify-end gap-2", className)} {...props} />;
}
