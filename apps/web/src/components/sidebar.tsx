import * as React from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  FolderOpen,
  Users,
  ScrollText,
  Webhook,
  Trash2,
  UserCog,
  ShieldCheck,
  ClipboardList,
  BookOpen,
  X,
  Server,
  HardDrive,
  Database,
} from "lucide-react";
import { IconFileSymlink } from "@tabler/icons-react";
import { Divide as HamburgerDivide } from "hamburger-react";
import { useTrashCount } from "../hooks/use-trash";
import { useDashboardMetrics } from "../hooks/use-dashboard";
import { formatBytes } from "@nqdrive/shared";
import {
  iconsidePng,
} from "../assets";

function cx(...c: (string | false | undefined | null)[]) {
  return c.filter(Boolean).join(" ");
}

const coloredSidebarStyle: React.CSSProperties = {
  backgroundColor: "var(--brand-a)",
  backgroundImage: "var(--brand-fill)",
  ["--sidebar-ink" as string]: "255 255 255",
  ["--sidebar-ink-strong" as string]: "255 255 255",
  ["--ink-500" as string]: "255 255 255",
} as React.CSSProperties;

function StorageMainIcon({ className }: { className?: string }) {
  return <Database className={className} />;
}

type SidebarContextValue = {
  mobileOpen: boolean;
  setMobileOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

const Ctx = React.createContext<SidebarContextValue>({
  mobileOpen: false,
  setMobileOpen: () => {},
});

export function useSidebar() {
  const { mobileOpen, setMobileOpen } = React.useContext(Ctx);
  return { isOpen: mobileOpen, setIsOpen: setMobileOpen };
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <Ctx.Provider value={{ mobileOpen, setMobileOpen }}>
      <div className="dashboard-shell flex flex-col overflow-hidden bg-[rgb(var(--background))] text-[rgb(var(--foreground))]">
        {children}
      </div>
    </Ctx.Provider>
  );
}

export function SidebarTrigger({ className }: { className?: string }) {
  const { mobileOpen, setMobileOpen } = React.useContext(Ctx);
  return (
    <span
      className={cx(
        "-mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[rgb(var(--foreground))] lg:mt-0 lg:hidden",
        className
      )}
    >
      <HamburgerDivide
        toggled={mobileOpen}
        toggle={setMobileOpen}
        size={28}
        duration={0.35}
        rounded
        label="Toggle navigation"
      />
    </span>
  );
}

type Item = { label: string; to: string; icon: React.ComponentType<{ className?: string }>; badge?: string };
type Group = { label: string; items: Item[] };

const MAIN: Item[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Storage", to: "/dashboard/storage", icon: StorageMainIcon },
  { label: "Files", to: "/dashboard/files", icon: FolderOpen },
];

const SYS: Item[] = [
  { label: "Users", to: "/dashboard/users", icon: Users },
  { label: "Logs", to: "/dashboard/logs", icon: ScrollText },
  { label: "API", to: "/dashboard/api", icon: Webhook },
  { label: "Docs", to: "/dashboard/documentation", icon: BookOpen },
];

const SETT: Item[] = [
  { label: "Primary Link", to: "/dashboard/primary-link", icon: IconFileSymlink },
  { label: "Account", to: "/dashboard/account", icon: UserCog },
  { label: "Security", to: "/dashboard/security", icon: ShieldCheck },
  { label: "Audit", to: "/dashboard/audit-logs", icon: ClipboardList },
];

const GROUPS: Group[] = [
  { label: "System", items: SYS },
  { label: "Settings", items: SETT },
];

function isActive(pathname: string, to: string) {
  return to === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(to);
}

function BrandLockup() {
  const siteName = import.meta.env.VITE_SITE_NAME || "NQDRIVE";
  return (
    <Link to="/dashboard" className="group/brand flex min-w-0 items-center gap-3">
      <img src={iconsidePng} alt="" className="h-10 w-10 shrink-0 brightness-0 invert" />
      <span className="min-w-0">
        <span className="block truncate font-display text-[17px] font-extrabold tracking-tight text-white">{siteName}</span>
        <span className="block truncate text-[11px] font-medium text-white/60">Console Admin</span>
      </span>
    </Link>
  );
}

const NavItem = React.memo(function NavItem({ item, onClose, danger }: { item: Item; onClose?: () => void; danger?: boolean; idPrefix?: string }) {
  const { pathname } = useLocation();
  const active = React.useMemo(() => isActive(pathname, item.to), [pathname, item.to]);

  return (
    <Link
      to={item.to}
      preload="intent"
      preloadDelay={80}
      onClick={onClose}
      aria-current={active ? "page" : undefined}
      className={cx(
        "group relative flex min-h-11 items-center gap-3.5 rounded-2xl px-4 text-[13.5px] font-semibold outline-none transition-colors",
        active
          ? danger
            ? "text-red-500 bg-white shadow-[0_4px_16px_-4px_rgba(0,0,0,0.25)] ring-1 ring-black/[0.04]"
            : "text-[var(--brand-a)] bg-white shadow-[0_4px_16px_-4px_rgba(0,0,0,0.25)] ring-1 ring-black/[0.04]"
          : danger
            ? "text-red-400 hover:bg-white/10 hover:text-red-300"
            : "text-white/90 hover:bg-white/10 hover:text-white"
      )}
    >
      <item.icon className={cx(
        "h-[18px] w-[18px] shrink-0 transition-colors",
        active
          ? danger ? "text-red-500" : "text-[var(--brand-a)]"
          : danger ? "text-red-400 group-hover:text-red-300" : "text-white/80 group-hover:text-white"
      )} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.badge && (
        <span className={cx("rounded-full px-2 py-0.5 text-[10px] font-bold", active ? "bg-[var(--brand-a)]/12 text-[var(--brand-a)]" : "bg-white/20 text-white")}>
          {item.badge}
        </span>
      )}
    </Link>
  );
});

const NavGroup = React.memo(function NavGroup({ group, onClose, idPrefix }: { group: Group; onClose?: () => void; idPrefix?: string }) {
  return (
    <div>
      <p className="px-3 pb-1 pt-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/60">{group.label}</p>
      <nav className="space-y-1">
        {group.items.map((item) => <NavItem key={item.to} item={item} onClose={onClose} idPrefix={idPrefix} />)}
      </nav>
    </div>
  );
});

function StorageWidget() {
  const { data } = useDashboardMetrics();
  const s = data?.summary;
  const used = s?.usedStorageBytes ?? 0;
  const total = s?.totalStorageBytes ?? 0;
  const pct = Math.min(100, Math.max(0, s?.usedPercentage ?? (total > 0 ? (used / total) * 100 : 0)));

  return (
    <div
      className="rounded-2xl p-4 text-white ring-1 ring-white/20"
      style={{ backgroundColor: "color-mix(in srgb, var(--brand-a) 68%, #05070d)" }}
    >
      <div className="flex items-center justify-between">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/20 text-white">
          <Server className="h-[18px] w-[18px]" />
        </span>
        <span className="font-mono text-xl font-extrabold tabular leading-none text-white">{Math.round(pct)}%</span>
      </div>
      <p className="mt-3 text-[13px] font-bold text-white">Storage pool</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20">
        <div className="h-full w-full origin-left rounded-full bg-white transition-transform duration-700" style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
      <p className="mt-2 truncate text-[10px] font-medium text-white/70">{formatBytes(used)}{total > 0 ? ` / ${formatBytes(total)}` : " used"}</p>
    </div>
  );
}

function SidebarBody({ onClose, idPrefix }: { onClose?: () => void; idPrefix?: string }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 scrollbar-hide">
      <p className="px-3 pb-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/60">Workspace</p>
      <nav className="space-y-1">
        {MAIN.map((item) => <NavItem key={item.to} item={item} onClose={onClose} idPrefix={idPrefix} />)}
      </nav>

      <div className="my-4" />

      <nav className="space-y-1.5">
        {GROUPS.map((group) => <NavGroup key={group.label} group={group} onClose={onClose} idPrefix={idPrefix} />)}
      </nav>

      <div className="my-4" />
      <NavItem item={{ label: "Trash", to: "/dashboard/trash", icon: Trash2 }} onClose={onClose} idPrefix={idPrefix} danger />
    </div>
  );
}

function DesktopSidebar() {
  return (
    <aside
      className="relative z-30 hidden h-screen w-[264px] shrink-0 flex-col overflow-hidden rounded-r-3xl lg:flex lg:-mt-[88px]"
      style={{ ...coloredSidebarStyle, boxShadow: "0 0 30px -8px rgba(0,0,0,0.25)" }}
    >
      <div className="flex h-[72px] shrink-0 items-center px-5">
        <BrandLockup />
      </div>

      <SidebarBody idPrefix="d" />

      <div className="shrink-0 p-3">
        <StorageWidget />
      </div>
    </aside>
  );
}

function MobileDrawer() {
  const { mobileOpen, setMobileOpen } = React.useContext(Ctx);
  const close = () => setMobileOpen(false);

  React.useEffect(() => {
    const html = document.documentElement;
    if (mobileOpen) {
      html.style.overflow = "hidden";
    } else {
      html.style.overflow = "";
    }
    return () => { html.style.overflow = ""; };
  }, [mobileOpen]);

  React.useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const PANEL_TRANSITION = { type: "tween" as const, ease: [0.32, 0.72, 0, 1], duration: 0.45 };
  const BACKDROP_TRANSITION = { type: "tween" as const, ease: [0.4, 0, 0.2, 1], duration: 0.35 };

  return (
    <>
      <motion.div
        initial={false}
        animate={{ opacity: mobileOpen ? 1 : 0 }}
        transition={BACKDROP_TRANSITION}
        onClick={close}
        aria-hidden={!mobileOpen}
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
        style={{ pointerEvents: mobileOpen ? "auto" : "none" }}
      />
      <motion.aside
        initial={false}
        animate={{ x: mobileOpen ? 0 : "-100%" }}
        transition={PANEL_TRANSITION}
        style={{ ...coloredSidebarStyle, willChange: "transform" }}
        className="fixed inset-y-0 left-0 z-50 flex h-full w-[70vw] max-w-[240px] flex-col overflow-hidden rounded-r-3xl lg:hidden"
      >
        <div className="flex h-[72px] shrink-0 items-center justify-between px-5">
          <BrandLockup />
          <button onClick={close} className="grid h-10 w-10 place-items-center rounded-xl text-white/80 transition hover:bg-white/10 hover:text-white" aria-label="Close navigation">
            <X className="h-5 w-5" />
          </button>
        </div>
        <SidebarBody onClose={close} idPrefix="m" />
        <div className="shrink-0 p-3">
          <StorageWidget />
        </div>
      </motion.aside>
    </>
  );
}

function BottomNav() {
  const loc = useLocation();
  const { data } = useTrashCount();
  const trash = data?.count ?? 0;

  const tabs = [
    { label: "Home", to: "/dashboard", icon: LayoutDashboard },
    { label: "Storage", to: "/dashboard/storage", icon: Database },
    { label: "Files", to: "/dashboard/files", icon: FolderOpen },
    { label: "Trash", to: "/dashboard/trash", icon: Trash2, badge: trash > 0 ? String(trash) : undefined },
  ];

  return (
    <nav className="safe-bottom fixed bottom-3 left-3 right-3 z-30 grid h-16 grid-cols-4 rounded-2xl border border-[rgb(var(--border-subtle))] glass-panel p-1.5 elevate-float lg:hidden">
      {tabs.map((tab) => {
        const active = isActive(loc.pathname, tab.to);
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={cx(
              "relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-bold transition-colors",
              active ? "text-white bg-gradient-to-br from-brand-500 to-brand-600 shadow-md shadow-brand-600/30" : "text-[rgb(var(--ink-500))] hover:bg-[rgb(var(--surface-muted))]/70"
            )}
          >
            
            <tab.icon className="h-5 w-5" />
            <span className="truncate">{tab.label}</span>
            {tab.badge && <span className="absolute right-2 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent-500 px-1 text-[9px] font-black leading-none text-white ring-2 ring-[rgb(var(--surface))]">{tab.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppSidebar() {
  return (
    <>
      <DesktopSidebar />
      <MobileDrawer />
    </>
  );
}
