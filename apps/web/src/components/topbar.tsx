import * as React from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  Palette,
  LogOut,
  ChevronDown,
  ShieldCheck,
  Clock as ClockIcon,
  UserCog,
  LayoutDashboard,
  FolderOpen,
  HardDrive,
  Database,
  Users,
  ScrollText,
  Webhook,
  BookOpen,
  ClipboardList,
  Trash2,
  Settings,
} from "lucide-react";
import { IconCloudUpload, IconFileSymlink } from "@tabler/icons-react";
import { motion, AnimatePresence } from "framer-motion";
import { googleDriveSvg, cloudflareR2Svg, amazonS3Svg, onedriveSvg } from "../assets";
import { SiDropbox } from "@icons-pack/react-simple-icons";
import { useTheme } from "../stores/theme-provider";
import { useUpdateSettings } from "../hooks/use-settings";
import { SidebarTrigger } from "./sidebar";
import { ThemeSidebar } from "./theme-sidebar";
import { UploadSidebar } from "./upload-sidebar";
import { useUploadGlobal } from "../stores/upload-provider";
import { useMigrationGlobal } from "../stores/migration-provider";
import { useAuthContext } from "../stores/auth-provider";
import { useLogout } from "../hooks/auth";
import { getAvatarSvg } from "../lib/avatar";
import { LoadingOverlay } from "./overlay";
import { AnimatedThemeToggler } from "./animated-theme-toggler";
import { getUserTimeZone, getUserUtcOffset } from "../lib/datetime";

function cx(...c: (string | false | undefined | null)[]) {
  return c.filter(Boolean).join(" ");
}

type IconType = React.ComponentType<{ className?: string }>;

// Wrapper SVG provider jadi komponen icon (compatible dengan type IconType).
function GD({ className }: { className?: string }) { return <img src={googleDriveSvg} alt="" className={className} />; }
function CF({ className }: { className?: string }) { return <img src={cloudflareR2Svg} alt="" className={className} />; }
function S3({ className }: { className?: string }) { return <img src={amazonS3Svg} alt="" className={className} />; }
function DBX({ className }: { className?: string }) { return <SiDropbox color="#0061FF" className={className} />; }
function OD({ className }: { className?: string }) { return <img src={onedriveSvg} alt="" className={className} />; }

const TITLES: Record<string, { title: string; section: string; icon: IconType }> = {
  "/dashboard": { title: "Dashboard", section: "Overview", icon: LayoutDashboard },
  "/dashboard/files": { title: "Files", section: "Workspace", icon: FolderOpen },
  "/dashboard/storage": { title: "Storage", section: "Workspace", icon: Database },
  "/dashboard/storage-manager": { title: "Storage", section: "Workspace", icon: Database },
  "/dashboard/cloudflare-r2": { title: "Cloudflare R2", section: "Storage", icon: CF },
  "/dashboard/s3-storage": { title: "S3 Storage", section: "Storage", icon: S3 },
  "/dashboard/dropbox": { title: "Storage", section: "Workspace", icon: Database },
  "/dashboard/onedrive": { title: "Storage", section: "Workspace", icon: Database },
  "/dashboard/users": { title: "Users", section: "System", icon: Users },
  "/dashboard/logs": { title: "Logs", section: "System", icon: ScrollText },
  "/dashboard/api": { title: "API", section: "System", icon: Webhook },
  "/dashboard/documentation": { title: "Documentation", section: "System", icon: BookOpen },
  "/dashboard/documentation/google-drive": { title: "Google Drive Docs", section: "System", icon: GD },
  "/dashboard/documentation/drop-box": { title: "Dropbox Docs", section: "System", icon: DBX },
  "/dashboard/documentation/one-drive": { title: "OneDrive Docs", section: "System", icon: OD },
  "/dashboard/primary-link": { title: "Primary Link", section: "Settings", icon: IconFileSymlink },
  "/dashboard/account": { title: "Account", section: "Settings", icon: UserCog },
  "/dashboard/security": { title: "Security", section: "Settings", icon: ShieldCheck },
  "/dashboard/audit-logs": { title: "Audit Logs", section: "Settings", icon: ClipboardList },
  "/dashboard/settings": { title: "Settings", section: "Settings", icon: Settings },
  "/dashboard/trash": { title: "Trash", section: "Workspace", icon: Trash2 },
  "/dashboard/google-accounts": { title: "Google Accounts", section: "Storage", icon: HardDrive },
  "/dashboard/docs": { title: "Docs", section: "System", icon: BookOpen },
};

function useTitle() {
  const { pathname } = useLocation();
  return TITLES[pathname] ?? { title: "Dashboard", section: "Overview", icon: LayoutDashboard };
}

/** Shadow header saat discroll — via IntersectionObserver dengan sentinel 1px (Facebook approach).
 *  Jauh lebih murah daripada scroll listener: 0 main-thread pressure saat scroll. */
function useScrolled() {
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    // Cari sentinel — jika tidak ada, cari scroll container
    const sentinel = document.getElementById("dashboard-scroll-sentinel") as HTMLElement | null;
    const scrollRoot = document.querySelector(".dashboard-scroll") as HTMLElement | null;
    if (!scrollRoot) return;

    // Jika sentinel ada, observasi apakah dia masih terlihat di scroll root
    if (sentinel) {
      let ticking = false;
      const io = new IntersectionObserver(
        (entries) => {
          if (ticking) return;
          ticking = true;
          requestAnimationFrame(() => {
            const entry = entries[0];
            if (entry) setScrolled(!entry.isIntersecting);
            ticking = false;
          });
        },
        { root: scrollRoot, threshold: 0 }
      );
      io.observe(sentinel);
      return () => io.disconnect();
    }

    // Fallback: scroll listener (jika sentinel tidak ditemukan) — tetap pakai rAF throttle
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        setScrolled(scrollRoot.scrollTop > 4);
        raf = 0;
      });
    };
    scrollRoot.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      scrollRoot.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return scrolled;
}

function Account() {
  const { user } = useAuthContext();
  const logout = useLogout();
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const [out, setOut] = React.useState(false);
  const [k, setK] = React.useState(0);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const h = () => setK((v) => v + 1);
    window.addEventListener("avatar-changed", h);
    return () => window.removeEventListener("avatar-changed", h);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const d = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const ky = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", d);
    document.addEventListener("keydown", ky);
    return () => {
      document.removeEventListener("mousedown", d);
      document.removeEventListener("keydown", ky);
    };
  }, [open]);

  const doLogout = async () => {
    setOpen(false);
    // flushSync: force render overlay SEBELUM sidebar disembunyikan → tidak ada kedip
    flushSync(() => { setOut(true); });
    document.body.classList.add("logging-out");
    try {
      await logout.mutateAsync();
      setTimeout(() => navigate({ to: "/login" }), 1200);
    } catch {
      setOut(false);
      document.body.classList.remove("logging-out");
    }
  };

  const src = getAvatarSvg(user?.username || user?.email || "Admin");

  return (
    <>
      <LoadingOverlay visible={out} message="Keluar..." />
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((p) => !p)}
          className="flex h-11 items-center gap-2 rounded-full pl-1 pr-1 transition-colors hover:bg-[rgb(var(--surface-muted))]/70 dark:hover:bg-white/[0.06] sm:pr-2.5"
          aria-label="Account menu"
        >
          <span className="h-9 w-9 overflow-hidden rounded-full ring-2 ring-[var(--brand-a)]" style={{ backgroundImage: "var(--brand-fill)" }}>
            <img src={src} key={k} alt="" className="h-full w-full object-cover" />
          </span>
          <span className="hidden max-w-28 text-left leading-tight sm:block">
            <span className="block truncate text-xs font-bold text-[rgb(var(--foreground))]">{user?.username ?? "Admin"}</span>
            <span className="block truncate text-[10px] font-medium text-[rgb(var(--ink-500))]">Operator</span>
          </span>
          <ChevronDown className={cx("h-4 w-4 shrink-0 text-[rgb(var(--ink-500))] transition-transform", open && "rotate-180")} />
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="absolute right-0 top-full z-[60] mt-2.5 w-56 origin-top-right overflow-hidden rounded-2xl border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] shadow-[var(--shadow-float)] ring-1 ring-black/[0.03] dark:border-white/10 dark:ring-white/10"
            >
              {/* Header — gradient tema, satu blok utuh */}
              <div className="px-4 pt-4 pb-3.5" style={{ backgroundColor: "var(--brand-a)", backgroundImage: "var(--brand-fill)" }}>
                <div className="flex items-center gap-3">
                  <span className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-white/20 ring-2 ring-white/30">
                    <img src={src} key={k} alt="" className="h-full w-full object-cover" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-white">{user?.username ?? "Admin"}</div>
                    <div className="truncate text-xs text-white/80">{user?.email ?? "—"}</div>
                  </div>
                </div>
                <span className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  <ShieldCheck className="h-3 w-3 text-emerald-300" /> Administrator
                </span>
              </div>

              {/* Menu */}
              <div className="p-1.5">
                <button
                  onClick={() => { setOpen(false); navigate({ to: "/dashboard/account" }); }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--surface-muted))]/70 dark:hover:bg-white/[0.06]"
                >
                  <UserCog className="h-4 w-4 text-[rgb(var(--ink-500))]" />
                  Account settings
                </button>
                <button
                  onClick={() => { setOpen(false); navigate({ to: "/dashboard/security" }); }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--surface-muted))]/70 dark:hover:bg-white/[0.06]"
                >
                  <ShieldCheck className="h-4 w-4 text-[rgb(var(--ink-500))]" />
                  Security
                </button>
                {/* Jam & timezone user (device/internet), bukan jam server */}
                <LocalTimeMenuItem />
              </div>
              <div className="border-t border-[rgb(var(--border-subtle))] p-1.5 dark:border-white/10">
                <button
                  onClick={doLogout}
                  disabled={out}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-500/10"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

/** Jam + timezone USER (device/internet) di dropdown akun — bukan jam server Cloudflare. */
function LocalTimeMenuItem() {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    // Update tepat di pergantian menit agar hemat render.
    let interval: ReturnType<typeof setInterval> | null = null;
    const align = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 60_000);
    }, (60 - new Date().getSeconds()) * 1000);
    return () => { clearTimeout(align); if (interval) clearInterval(interval); };
  }, []);

  const tz = React.useMemo(() => getUserTimeZone(), []);
  const offset = getUserUtcOffset(now);
  const time = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5">
      <ClockIcon className="h-4 w-4 shrink-0 text-[rgb(var(--ink-500))]" />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="font-mono text-sm font-bold tabular-nums text-[rgb(var(--foreground))]">{time} <span className="text-[10px] font-semibold text-[rgb(var(--ink-500))]">{offset}</span></p>
        <p className="truncate text-[10px] font-medium text-[rgb(var(--ink-500))]">{tz}</p>
      </div>
    </div>
  );
}

function IconButton({
  children,
  onClick,
  label,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "grid h-11 w-11 place-items-center rounded-full text-[rgb(var(--ink-500))] transition-colors hover:bg-[rgb(var(--surface-muted))]/70 hover:text-brand-600 dark:hover:bg-white/[0.06] dark:hover:text-brand-300",
        className
      )}
      aria-label={label}
    >
      {children}
    </button>
  );
}

export function Topbar() {
  const { theme, brandColor, setThemeSidebarOpen, saveThemeToDb } = useTheme();
  const { items, setUploadSidebarOpen } = useUploadGlobal();
  const { activeJobs } = useMigrationGlobal();
  const updateSettings = useUpdateSettings();
  const { title, icon: PageIcon } = useTitle();
  const scrolled = useScrolled();

  const doToggle = React.useCallback((next: "light" | "dark") => {
    saveThemeToDb(next);
    let accent: string | null = null;
    try { accent = localStorage.getItem("nqdrive-accent-color"); } catch {}
    const encoded = accent && /^#[0-9a-fA-F]{6}$/.test(accent) ? `${brandColor}:${accent}` : brandColor;
    updateSettings.mutate({ theme_mode: next, brand_color: encoded });
  }, [brandColor, saveThemeToDb, updateSettings]);

  // Memoize upload progress — jangan hitung ulang tiap topbar render (upload items bisa update 10x/detik)
  const { count, off, C } = React.useMemo(() => {
    const uploading = items.filter((i) => i.status === "uploading");
    const c = uploading.length + activeJobs.length;
    const totalB = uploading.reduce((s, i) => s + i.progress.totalBytes, 0) + activeJobs.reduce((s, j) => s + j.totalBytes, 0);
    const doneB = uploading.reduce((s, i) => s + i.progress.uploadedBytes, 0) + activeJobs.reduce((s, j) => s + j.migratedBytes, 0);
    const pct = totalB > 0 ? (doneB / totalB) * 100 : 0;
    const R = 12;
    const circ = 2 * Math.PI * R;
    const offset = circ - (pct / 100) * circ;
    return { count: c, off: offset, C: circ };
  }, [items, activeJobs]);

  const R = 12;

  return (
    <>
      <ThemeSidebar />
      <UploadSidebar />

      <header
        className={cx(
          "z-10 h-[72px] shrink-0 border-b border-[rgb(var(--border-subtle))]/70 glass-panel transition-shadow duration-300 dark:border-white/10 lg:h-[88px]",
          scrolled ? "shadow-[0_10px_30px_-14px_rgba(16,23,38,0.28)]" : ""
        )}
      >
        <div className="flex h-full items-center gap-2 px-3 sm:gap-3 sm:px-5 lg:pl-[288px] lg:pr-6">
          <SidebarTrigger />

          {/* Ikon menu aktif + judul (Android: ikon ~22px; desktop: ikon ~24px + judul) */}
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <PageIcon className="h-[22px] w-[22px] shrink-0 text-[rgb(var(--foreground))] lg:h-6 lg:w-6" />
            <h1 className="hidden truncate font-display text-lg font-extrabold tracking-tight text-[rgb(var(--foreground))] sm:block sm:text-[22px]">{title}</h1>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <AnimatedThemeToggler theme={theme} onThemeChange={doToggle} />
            <IconButton label="Theme settings" onClick={() => setThemeSidebarOpen(true)}>
              <Palette className="h-[18px] w-[18px]" />
            </IconButton>
            <button
              onClick={() => setUploadSidebarOpen(true)}
              className="relative grid h-11 w-11 place-items-center rounded-full text-[rgb(var(--ink-500))] transition-colors hover:bg-[rgb(var(--surface-muted))]/70 hover:text-brand-600 dark:hover:bg-white/[0.06] dark:hover:text-brand-300"
              aria-label="Uploads"
            >
              {count > 0 ? (
                <>
                  <svg viewBox="0 0 40 40" className="absolute h-11 w-11 -rotate-90">
                    <circle cx="20" cy="20" r={R} className="stroke-[rgb(var(--border-subtle))]" strokeWidth="2" fill="none" />
                    <circle cx="20" cy="20" r={R} className="stroke-brand-500" strokeWidth="2" fill="none" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} />
                  </svg>
                  <IconCloudUpload className="relative z-10 h-[18px] w-[18px] text-brand-600 dark:text-brand-300" />
                  <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent-500 px-1 font-mono text-[10px] font-black text-white ring-2 ring-[rgb(var(--surface))]">{count}</span>
                </>
              ) : (
                <IconCloudUpload className="h-[20px] w-[20px]" />
              )}
            </button>
            <Account />
          </div>
        </div>
      </header>
    </>
  );
}
