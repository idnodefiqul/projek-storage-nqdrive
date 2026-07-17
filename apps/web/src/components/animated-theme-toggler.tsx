import { useCallback, useRef } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@nqdrive/ui";

/**
 * AnimatedThemeToggler — port dari Magic UI (magicui.design) untuk theme-provider NQDRIVE.
 *
 * Pakai View Transitions API: saat toggle, snapshot halaman lama & baru di-blend
 * dengan animasi lingkaran (clip-path circle) yang melebar dari posisi tombol.
 * Browser tanpa dukungan (Firefox lama/Safari lama) fallback ke ganti tema biasa.
 */
export function AnimatedThemeToggler({
  theme,
  onThemeChange,
  className,
  duration = 900,
}: {
  theme: "light" | "dark";
  onThemeChange: (next: "light" | "dark") => void;
  className?: string;
  duration?: number;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Kunci anti spam-klik: selama transisi jalan, klik berikutnya diabaikan.
  // Tanpa ini, klik bolak-balik cepat membatalkan snapshot di tengah animasi → macet/glitch.
  const busyRef = useRef(false);

  const toggle = useCallback(async () => {
    if (busyRef.current) return;
    // Sumber kebenaran = kelas .dark di DOM (state React sengaja telat sinkron
    // sampai animasi kelar, jadi prop `theme` bisa basi saat klik cepat).
    const isDarkNow = document.documentElement.classList.contains("dark");
    const next = isDarkNow ? "light" : "dark";
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } };

    // Fallback HANYA bila browser tidak punya View Transitions API (Firefox lama dsb).
    // prefers-reduced-motion TIDAK dicek — di Windows, setting "Show animations" yang
    // off membuat flag itu aktif dan animasi tidak pernah muncul di desktop.
    if (!doc.startViewTransition) {
      onThemeChange(next);
      return;
    }

    busyRef.current = true;

    // PENTING (anti-macet): di dalam callback HANYA toggle kelas .dark — operasi murah.
    // Kalau seluruh app React di-render sinkron di sini (flushSync), snapshot halaman
    // baru harus menunggu render berat (chart dll) → animasi patah-patah.
    const transition = doc.startViewTransition(() => {
      document.documentElement.classList.toggle("dark", next === "dark");
    });

    try {
      await transition.ready;
    } catch {
      busyRef.current = false;
      onThemeChange(next);
      return; // transisi dibatalkan — pastikan state tetap sinkron
    }

    // Lingkaran melebar dari TENGAH layar ke sudut terjauh.
    const x = window.innerWidth / 2;
    const y = window.innerHeight / 2;
    const maxRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${maxRadius}px at ${x}px ${y}px)`] },
      {
        duration,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        pseudoElement: "::view-transition-new(root)",
      }
    );

    // Sinkronkan state React (icon, provider, simpan DB) SETELAH animasi selesai —
    // supaya re-render komponen berat tidak mengganggu frame animasi.
    transition.finished.finally(() => {
      busyRef.current = false;
      onThemeChange(next);
    });
  }, [onThemeChange, duration]);

  return (
    <button
      ref={buttonRef}
      onClick={toggle}
      aria-label={theme === "dark" ? "Aktifkan mode terang" : "Aktifkan mode gelap"}
      className={cn(
        "grid h-11 w-11 place-items-center rounded-full text-[rgb(var(--ink-500))] transition-colors hover:bg-[rgb(var(--surface-muted))]/70 hover:text-brand-600 dark:hover:bg-white/[0.06] dark:hover:text-brand-300",
        className
      )}
    >
      {theme === "dark" ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
    </button>
  );
}
