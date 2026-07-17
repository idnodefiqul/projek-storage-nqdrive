import { useState, useEffect, useRef, useId, useCallback } from "react";
import { X, Check, RotateCcw } from "lucide-react";
import { Button, useToast, cn } from "@nqdrive/ui";
import { useTheme, DEFAULT_BRAND, ACCENT_COLOR_KEY } from "../stores/theme-provider";
import { useUpdateSettings } from "../hooks/use-settings";
import { motion, AnimatePresence } from "framer-motion";

const PRESET_COLORS = [
  { label: "Emerald", hex: "#10b981" },
  { label: "Ocean", hex: "#0ea5e9" },
  { label: "Indigo", hex: "#6366f1" },
  { label: "Slate", hex: "#334155" },
  { label: "Teal", hex: "#0f766e" },
];

const GRADIENT_PRESETS = [
  // Premium muted — ganti Ocean yang terlalu terang cyan->indigo
  // Deep ink Oxford blue -> muted slate-teal, trust, Stripe-like, tidak terang
  { label: "Nocturne", from: "#142B49", to: "#2F5D6B" },
  { label: "Sunset", from: "#f97316", to: "#ec4899" },
  // Premium muted — ganti Aurora neon violet-cyan
  // Ink aubergine-indigo -> sage-slate, architectural, S<25%
  { label: "Hush", from: "#2F2E4A", to: "#5A7D7A" },
  { label: "Ferry", from: "#0f766e", to: "#06b6d4" },
  { label: "Tide", from: "#06b6d4", to: "#3b82f6" },
  // Premium muted — ganti Dusk pink terang
  // Deep plum-slate -> rosy taupe brass gelap L39 biar kontras putih aman
  { label: "Suede", from: "#33283C", to: "#755E4E" },
  // Premium — deep navy → muted teal (trust, kalem, tidak terang) - keep
  { label: "Prestige", from: "#0a2342", to: "#2c7a7b" },
  // Premium — charcoal blue-black -> muted straw-gold, ganti Champagne yang L64 terlalu terang
  { label: "Gilded", from: "#1F2530", to: "#9C8A6B" },
  // Fresh Mint keep (user request) - success/profit
  { label: "Fresh Mint", from: "#11998E", to: "#38EF7D" },
  // New 3 gradients - user request ganti
  { label: "Danger", from: "#CB2D3E", to: "#EF473F" }, // Tombol bahaya delete/error
  { label: "Cosmic Silk", from: "#2B5876", to: "#4E4376" }, // Tenang eksklusif ramah mata admin
  { label: "Velvet Wine", from: "#41295A", to: "#2F0743" }, // Deep wine eksklusif
];

function readStoredAccent(): string | null {
  try {
    const v = localStorage.getItem(ACCENT_COLOR_KEY);
    return v && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

const PANEL_TRANSITION = { type: "tween" as const, ease: [0.32, 0.72, 0, 1], duration: 0.45 };
const BACKDROP_TRANSITION = { type: "tween" as const, ease: [0.4, 0, 0.2, 1], duration: 0.35 };
const CONTENT_TRANSITION = { type: "tween" as const, ease: [0.32, 0.72, 0, 1], duration: 0.35, delay: 0.08 };

const FOCUSABLE_SEL = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SEL)).filter((el) => {
    if (el.hasAttribute("disabled")) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    const cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    return el.getClientRects().length > 0 || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
  });
}

export function ThemeSidebar() {
  const { brandColor, setBrandColor, setGradient, theme, isThemeSidebarOpen, setThemeSidebarOpen } = useTheme();
  const [localColor, setLocalColor] = useState(brandColor);
  const [localAccent, setLocalAccent] = useState<string | null>(null);
  const updateSettings = useUpdateSettings();
  const { toast } = useToast();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const prevActiveRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const html = document.documentElement;
    if (isThemeSidebarOpen) {
      prevActiveRef.current = document.activeElement as HTMLElement | null;
      html.style.overflow = "hidden";
      setLocalColor(brandColor);
      setLocalAccent(readStoredAccent());
      requestAnimationFrame(() => {
        const c = panelRef.current;
        if (!c) return;
        const f = getFocusable(c);
        f[0]?.focus();
      });
    } else {
      html.style.overflow = "";
      const prev = prevActiveRef.current;
      if (prev) setTimeout(() => { try { prev.focus(); } catch {} }, 0);
    }
    return () => { html.style.overflow = ""; };
  }, [isThemeSidebarOpen, brandColor]);

  useEffect(() => {
    if (!isThemeSidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const container = panelRef.current;
      if (!container) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setThemeSidebarOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = getFocusable(container);
      if (focusable.length === 0) { e.preventDefault(); return; }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !container.contains(active)) { e.preventDefault(); last.focus(); }
      } else {
        if (active === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [isThemeSidebarOpen, setThemeSidebarOpen]);

  const handleClose = useCallback(() => setThemeSidebarOpen(false), [setThemeSidebarOpen]);

  const pickSolid = (hex: string) => { setLocalColor(hex); setLocalAccent(null); };
  const pickGradient = (from: string, to: string) => { setLocalColor(from); setLocalAccent(to); };
  const previewBg = localAccent ? `linear-gradient(135deg, ${localColor}, ${localAccent})` : localColor;

  const handleSave = () => {
    if (localAccent) setGradient(localColor, localAccent);
    else setBrandColor(localColor);
    const encoded = localAccent ? `${localColor}:${localAccent}` : localColor;
    updateSettings.mutate(
      { brand_color: encoded, theme_mode: theme },
      {
        onSuccess: () => toast({ title: "Theme disimpan", description: "Warna tema berhasil diperbarui.", variant: "success" }),
        onError: () => toast({ title: "Gagal menyimpan tema", description: "Periksa koneksi dan coba lagi.", variant: "error" }),
      }
    );
    handleClose();
  };

  const handleReset = () => { setLocalColor(DEFAULT_BRAND); setLocalAccent(null); };

  return (
    <AnimatePresence mode="wait">
      {isThemeSidebarOpen && (
        <>
          <motion.div
            key="theme-backdrop"
            className="fixed inset-0 z-[70] bg-black/30 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={BACKDROP_TRANSITION}
            onClick={handleClose}
            aria-hidden="true"
          />
          <motion.div
            key="theme-panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="fixed right-0 top-0 bottom-0 z-[71] flex w-72 flex-col overflow-hidden rounded-l-3xl text-white sm:w-80 focus:outline-none"
            style={{ backgroundColor: "var(--brand-a)", backgroundImage: "var(--brand-fill)", willChange: "transform, opacity", boxShadow: "0 0 30px -8px rgba(0,0,0,0.25)" }}
            initial={{ x: "100%", opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={PANEL_TRANSITION}
          >
            <motion.div className="flex shrink-0 items-center justify-between p-4" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={CONTENT_TRANSITION}>
              <h2 id={titleId} className="text-base font-bold text-white">Theme</h2>
              <button type="button" onClick={handleClose} aria-label="Tutup panel tema" className="rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </motion.div>
            <motion.div className="mx-3 mb-3 min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-hide rounded-2xl bg-[rgb(var(--surface))] p-4 text-[rgb(var(--foreground))]" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ ...CONTENT_TRANSITION, delay: 0.12 }}>
              <div className="flex items-center gap-3 rounded-xl border border-[rgb(var(--border-subtle))] p-3">
                <div className="h-10 w-10 rounded-xl shadow-sm ring-1 ring-black/5" style={{ background: previewBg }} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-[rgb(var(--foreground))] truncate">{localAccent ? "Gradient Mode" : "Solid Mode"}</p>
                  <p className="text-[11px] font-mono text-[rgb(var(--ink-500))] truncate">{localAccent ? `${localColor} → ${localAccent}` : localColor}</p>
                </div>
                <button type="button" onClick={handleReset} aria-label="Reset ke warna default" className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[rgb(var(--ink-500))] mb-3">Warna Solid</p>
                <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Pilih warna solid">
                  {PRESET_COLORS.map((preset) => {
                    const isActive = !localAccent && localColor.toLowerCase() === preset.hex.toLowerCase();
                    return (
                      <button key={preset.hex} type="button" role="radio" aria-checked={isActive} aria-label={`Warna ${preset.label} ${preset.hex}`} onClick={() => pickSolid(preset.hex)} className={cn("group relative flex flex-col items-center gap-1.5 rounded-xl p-2.5 transition-all border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500", isActive ? "border-[rgb(var(--foreground))] bg-[rgb(var(--surface-muted))]/80 dark:border-white" : "border-transparent hover:bg-[rgb(var(--surface-muted))]/60")}>
                        <div className="h-9 w-9 rounded-full shadow-sm ring-1 ring-black/10" style={{ backgroundColor: preset.hex }} aria-hidden="true" />
                        <span className="text-[10px] font-medium text-[rgb(var(--ink-500))]">{preset.label}</span>
                        {isActive && <div className="absolute top-1.5 right-1.5 grid h-4 w-4 place-items-center rounded-full bg-[rgb(var(--foreground))] text-[rgb(var(--surface))]" aria-hidden="true"><Check className="h-2.5 w-2.5" /></div>}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[rgb(var(--ink-500))] mb-3">Gradient ({GRADIENT_PRESETS.length}) • Full Theme</p>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Pilih tema gradient">
                  {GRADIENT_PRESETS.map((g) => {
                    const active = localAccent?.toLowerCase() === g.to.toLowerCase() && localColor.toLowerCase() === g.from.toLowerCase();
                    return (
                      <button key={g.label} type="button" role="radio" aria-checked={active} aria-label={`Gradient ${g.label} ${g.from} → ${g.to}`} title={`${g.label}: ${g.from} → ${g.to}`} onClick={() => pickGradient(g.from, g.to)} className={cn("group relative flex flex-col items-start gap-2 rounded-xl p-3 transition-all border-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500", active ? "border-[rgb(var(--foreground))] bg-[rgb(var(--surface-muted))]/80 dark:border-white" : "border-[rgb(var(--border-subtle))] hover:border-brand-200 hover:bg-[rgb(var(--surface-muted))]/60")}>
                        <div className="flex w-full items-center gap-2.5">
                          <div className="h-9 w-9 shrink-0 rounded-full shadow-sm ring-1 ring-black/10" style={{ background: `linear-gradient(135deg, ${g.from}, ${g.to})` }} aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11px] font-bold leading-tight text-[rgb(var(--foreground))]">{g.label}</p>
                            <p className="truncate font-mono text-[9px] leading-tight text-[rgb(var(--ink-500))]">{g.from} → {g.to}</p>
                          </div>
                        </div>
                        {active && <div className="absolute top-2 right-2 grid h-4 w-4 place-items-center rounded-full bg-[rgb(var(--foreground))] text-[rgb(var(--surface))]" aria-hidden="true"><Check className="h-2.5 w-2.5" /></div>}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[rgb(var(--ink-500))] mb-3">Preview</p>
                <div className="rounded-xl border border-[rgb(var(--border-subtle))] p-4 space-y-3 bg-[rgb(var(--surface-muted))]/30">
                  <div className="flex gap-2">
                    <div className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm" style={{ background: previewBg }}>Primary</div>
                    <div className="rounded-lg px-3 py-1.5 text-xs font-semibold border bg-transparent" style={{ borderColor: localColor, color: localColor }}>Outline</div>
                  </div>
                  <div className="h-2 rounded-full bg-[rgb(var(--border-subtle))] overflow-hidden"><div className="h-full rounded-full w-2/3" style={{ background: previewBg }} /></div>
                  <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full" style={{ background: previewBg }} aria-hidden="true" /><span className="text-xs font-medium" style={{ color: localColor }}>Brand text preview</span></div>
                </div>
              </div>
            </motion.div>
            <motion.div className="flex shrink-0 gap-2 px-3 pb-3" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ ...CONTENT_TRANSITION, delay: 0.15 }}>
              <Button variant="outline" onClick={handleClose} aria-label="Batal mengubah tema" className="flex-1 border-white/20 dark:border-zinc-600 text-white dark:text-zinc-100 bg-white/10 hover:bg-white/15 dark:bg-zinc-800 dark:hover:bg-zinc-700">Batal</Button>
              <Button onClick={handleSave} aria-label="Simpan perubahan tema" className="flex-1 bg-white text-[var(--brand-a)] hover:bg-white/90 dark:bg-white dark:text-[var(--brand-a)]" disabled={updateSettings.isPending}><Check className="h-4 w-4" aria-hidden="true" />Simpan</Button>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
