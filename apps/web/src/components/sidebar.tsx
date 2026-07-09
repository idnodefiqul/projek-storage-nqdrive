import * as React from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { cn, NqdriveLogo } from "@nqdrive/ui";
import {
  LayoutDashboard,
  FolderOpen,
  HardDrive,
  Users,
  ScrollText,
  Webhook,
  Settings,
  Menu,
  X,
  Trash2,
  ChevronDown,
  Link2,
  UserCog,
  LogOut,
  ShieldCheck,
  ClipboardList,
  BookOpen,
} from "lucide-react";
import { getAvatarSvg } from "../lib/avatar";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthContext } from "../stores/auth-provider";
import { useTrashCount } from "../hooks/use-trash";
import { useLogout } from "../hooks/auth";
import { useNavigate } from "@tanstack/react-router";
import { LoadingOverlay } from "./overlay";
import {
  iconsidePng, logoMainPng,
  googleDriveSvg, cloudflareR2Svg, amazonS3Svg, telegramSvg, onedriveSvg,
} from "../assets";

// ─── STORAGE PROVIDER ICONS ───────────────────────────────────────────────────

function GoogleDriveIcon({ className }: { className?: string }) {
  return <img src={googleDriveSvg} alt="Google Drive" className={className} />;
}

function CloudflareIcon({ className }: { className?: string }) {
  return <img src={cloudflareR2Svg} alt="Cloudflare R2" className={className} />;
}

function S3Icon({ className }: { className?: string }) {
  return <img src={amazonS3Svg} alt="S3 Storage" className={className} />;
}

function TelegramIcon({ className }: { className?: string }) {
  return <img src={telegramSvg} alt="Telegram" className={className} />;
}

function OneDriveIcon({ className }: { className?: string }) {
  return <img src={onedriveSvg} alt="OneDrive" className={className} />;
}

// ─── CONTEXT ──────────────────────────────────────────────────────────────────
const SidebarContext = React.createContext<{
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
}>({ isOpen: false, setIsOpen: () => {} });

export function useSidebar() {
  return React.useContext(SidebarContext);
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = React.useState(false);

  React.useEffect(() => {
    const check = () => setIsOpen(window.innerWidth >= 1024);
    check();
  }, []);

  return (
    <SidebarContext.Provider value={{ isOpen, setIsOpen }}>
      <div className="flex h-[100dvh] overflow-hidden w-full bg-zinc-50 dark:bg-zinc-950">
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

// ─── TRIGGER ──────────────────────────────────────────────────────────────────
export function SidebarTrigger({ className }: { className?: string }) {
  const { isOpen, setIsOpen } = useSidebar();
  return (
    <button
      onClick={() => setIsOpen((p) => !p)}
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-500",
        "hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition-colors overflow-hidden",
        className
      )}
      aria-label="Toggle Sidebar"
    >
      <motion.span
        className="absolute"
        animate={{ opacity: isOpen ? 0 : 1, scale: isOpen ? 0.6 : 1, rotate: isOpen ? -90 : 0 }}
        transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
        style={{ willChange: "transform, opacity" }}
      >
        <Menu className="h-5 w-5" />
      </motion.span>
      <motion.span
        className="absolute"
        animate={{ opacity: isOpen ? 1 : 0, scale: isOpen ? 1 : 0.6, rotate: isOpen ? 0 : 90 }}
        transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
        style={{ willChange: "transform, opacity" }}
      >
        <X className="h-5 w-5" />
      </motion.span>
    </button>
  );
}

// ─── NAV ITEMS ────────────────────────────────────────────────────────────────
type NavItem = {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
};

const TOP_NAV: NavItem[] = [
  { label: "Dashboard", to: "/dashboard",       icon: LayoutDashboard },
  { label: "Files",     to: "/dashboard/files",  icon: FolderOpen },
];

// Storage Manager sub-items (collapsible group)
const STORAGE_CHILDREN: NavItem[] = [
  { label: "Google Drive",     to: "/dashboard/storage-manager", icon: GoogleDriveIcon },
  { label: "Cloudflare R2",    to: "/dashboard/cloudflare-r2",   icon: CloudflareIcon },
  { label: "S3 Storage",       to: "/dashboard/s3-storage",      icon: S3Icon },
  { label: "Telegram Storage", to: "/dashboard/telegram-storage", icon: TelegramIcon },
  { label: "OneDrive",         to: "/dashboard/onedrive",        icon: OneDriveIcon },
];

const BOTTOM_NAV: NavItem[] = [
  { label: "Users",         to: "/dashboard/users",    icon: Users },
  { label: "Logs",          to: "/dashboard/logs",     icon: ScrollText },
  { label: "API",           to: "/dashboard/api",      icon: Webhook },
  { label: "Documentation", to: "/dashboard/documentation", icon: BookOpen },
];

// Settings sub-items (collapsible group)
const SETTINGS_CHILDREN: NavItem[] = [
  { label: "Primary Link", to: "/dashboard/primary-link", icon: Link2 },
  { label: "Account",      to: "/dashboard/account",      icon: UserCog },
  { label: "Security",     to: "/dashboard/security",     icon: ShieldCheck },
  { label: "Audit Logs",   to: "/dashboard/audit-logs",   icon: ClipboardList },
];

// All storage route prefixes for detecting active state on parent
const STORAGE_PREFIXES = STORAGE_CHILDREN.map((c) => c.to);
const SETTINGS_PREFIXES = SETTINGS_CHILDREN.map((c) => c.to);

// ─── COLLAPSIBLE ANIMATION ────────────────────────────────────────────────────
const COLLAPSE_EASE = [0.32, 0.72, 0, 1] as const;
const SIDEBAR_GROUP_STORAGE_KEY = "nqdrive-sidebar-open-groups";

// ─── SINGLE NAV LINK ──────────────────────────────────────────────────────────
function NavLink({
  item,
  isCollapsed,
  onClose,
  isChild = false,
}: {
  item: NavItem;
  isCollapsed: boolean;
  onClose: () => void;
  isChild?: boolean;
}) {
  const location = useLocation();
  const { data: trashCountData } = useTrashCount();
  const trashCount = trashCountData?.count ?? 0;

  const isActive =
    item.to === "/dashboard"
      ? location.pathname === "/dashboard"
      : location.pathname.startsWith(item.to);
  const isTrash = item.to === "/dashboard/trash";

  return (
    <Link
      to={item.to}
      title={isCollapsed ? item.label : undefined}
      onClick={() => { if (window.innerWidth < 1024) onClose(); }}
      className={cn(
        "group relative flex items-center rounded-lg transition-colors duration-150",
        isCollapsed
          ? "justify-center h-10 w-10 lg:h-11 lg:w-11 mx-auto"
          : isChild
            ? "px-3 py-2 lg:py-2.5 gap-3 ml-3 pl-4"
            : "px-3 py-2.5 lg:py-3 gap-3",
        isActive
          ? isTrash
            ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400 font-medium"
            : "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400 font-medium"
          : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-zinc-50"
      )}
    >
      <item.icon
        className={cn(
          "shrink-0 transition-colors",
          isCollapsed ? "h-5 w-5 lg:h-6 lg:w-6" : isChild ? "h-4 w-4 lg:h-[18px] lg:w-[18px]" : "h-4 w-4 lg:h-5 lg:w-5",
          isActive
            ? isTrash
              ? "text-red-600 dark:text-red-400"
              : "text-brand-600 dark:text-brand-400"
            : isTrash
              ? "text-red-400 dark:text-red-500 group-hover:text-red-500 dark:group-hover:text-red-400"
              : "text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300"
        )}
      />
      {!isCollapsed && (
        <span className={cn("truncate flex-1", isChild ? "text-[13px] lg:text-sm" : "text-sm lg:text-[15px]")}>{item.label}</span>
      )}

      {/* Trash badge */}
      {isTrash && trashCount > 0 && (
        isCollapsed ? (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
            {trashCount > 99 ? "99+" : trashCount}
          </span>
        ) : (
          <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 px-1.5 text-[11px] font-bold text-red-600 dark:text-red-400">
            {trashCount > 99 ? "99+" : trashCount}
          </span>
        )
      )}

      {/* Active dot */}
      {isActive && !isCollapsed && !isTrash && (
        <div className="absolute right-2.5 h-1.5 w-1.5 rounded-full bg-brand-500" />
      )}
    </Link>
  );
}

// ─── GENERIC COLLAPSIBLE NAV GROUP ────────────────────────────────────────────
function CollapsibleGroup({
  isCollapsed,
  onClose,
  label,
  icon: Icon,
  children: items,
  prefixes,
}: {
  isCollapsed: boolean;
  onClose: () => void;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: NavItem[];
  prefixes: string[];
}) {
  const location = useLocation();
  const storageKey = `${SIDEBAR_GROUP_STORAGE_KEY}:${label}`;
  const isAnyChildActive = prefixes.some((p) => location.pathname.startsWith(p));
  const [open, setOpenState] = React.useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) return saved === "true";
    } catch {}
    return isAnyChildActive;
  });
  const setOpen = React.useCallback((value: React.SetStateAction<boolean>) => {
    setOpenState((previous) => {
      const next = typeof value === "function" ? (value as (current: boolean) => boolean)(previous) : value;
      try { localStorage.setItem(storageKey, String(next)); } catch {}
      return next;
    });
  }, [storageKey]);

  React.useEffect(() => {
    if (isAnyChildActive) setOpen(true);
  }, [isAnyChildActive, setOpen]);

  // Collapsed sidebar: icon with hover flyout
  if (isCollapsed) {
    return (
      <div className="relative group">
        <button
          title={label}
          onClick={() => {}}
          className={cn(
            "flex items-center justify-center h-10 w-10 lg:h-11 lg:w-11 mx-auto rounded-lg transition-colors duration-150",
            isAnyChildActive
              ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400 font-medium"
              : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-zinc-50"
          )}
        >
          <Icon
            className={cn(
              "h-5 w-5 lg:h-6 lg:w-6 shrink-0 transition-colors",
              isAnyChildActive
                ? "text-brand-600 dark:text-brand-400"
                : "text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300"
            )}
          />
        </button>

        {/* Collapsed tooltip flyout */}
        <div className="absolute left-full top-0 ml-2 hidden group-hover:flex flex-col z-[60] min-w-[180px] rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl py-1.5">
          <span className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            {label}
          </span>
          {items.map((child) => {
            const active = location.pathname.startsWith(child.to);
            return (
              <Link
                key={child.to}
                to={child.to}
                onClick={() => { if (window.innerWidth < 1024) onClose(); }}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400 font-medium"
                    : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800/60"
                )}
              >
                <child.icon className="h-4 w-4 lg:h-[18px] lg:w-[18px] shrink-0" />
                <span className="truncate">{child.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  // Expanded sidebar: collapsible accordion
  return (
    <div>
      {/* Parent toggle */}
      <button
        onClick={() => setOpen((p) => !p)}
        className={cn(
          "w-full group relative flex items-center rounded-lg transition-colors duration-150 px-3 py-2.5 lg:py-3 gap-3",
          isAnyChildActive
            ? "bg-brand-50/50 text-brand-700 dark:bg-brand-500/5 dark:text-brand-400"
            : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-zinc-50"
        )}
      >
        <Icon
          className={cn(
            "h-4 w-4 lg:h-5 lg:w-5 shrink-0 transition-colors",
            isAnyChildActive
              ? "text-brand-600 dark:text-brand-400"
              : "text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300"
          )}
        />
        <span className="truncate text-sm lg:text-[15px] flex-1 text-left font-medium">{label}</span>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.3, ease: COLLAPSE_EASE }}
        >
          <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
        </motion.div>
      </button>

      {/* Children with smooth height animation */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key={`${label}-children`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: COLLAPSE_EASE }}
            className="overflow-hidden"
          >
            {/* Left border line for visual hierarchy */}
            <div className="relative ml-[1.35rem] border-l-2 border-zinc-200 dark:border-zinc-800 pl-0">
              <div className="flex flex-col gap-0.5 py-1">
                {items.map((child, i) => (
                  <motion.div
                    key={child.to}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.2, delay: i * 0.04, ease: COLLAPSE_EASE }}
                  >
                    <NavLink item={child} isCollapsed={false} onClose={onClose} isChild />
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── SIDEBAR CONTENT (shared between desktop collapsed & mobile drawer) ────────
function SidebarContent({
  isCollapsed,
  onClose,
}: {
  isCollapsed: boolean;
  onClose: () => void;
}) {
  const { user } = useAuthContext();
  const logout = useLogout();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);
  const [avatarKey, setAvatarKey] = React.useState(0);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout.mutateAsync();
      setTimeout(() => {
        navigate({ to: "/login" });
      }, 1200);
    } catch {
      setIsLoggingOut(false);
    }
  };

  React.useEffect(() => {
    const handler = () => setAvatarKey((k: number) => k + 1);
    window.addEventListener("avatar-changed", handler);
    return () => window.removeEventListener("avatar-changed", handler);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className={cn(
          "flex shrink-0 border-b border-zinc-200 dark:border-zinc-800 relative",
          isCollapsed
            ? "h-16 items-center justify-center px-0"
            : "flex-col items-center justify-center pt-4 pb-4 lg:pt-6 lg:pb-6 px-3 gap-2"
        )}
      >
        <Link
          to="/dashboard"
          className={cn(
            "flex flex-col items-center gap-2 hover:opacity-90 transition-opacity",
            "lg:mt-0",
            isCollapsed ? "-mt-2" : "-mt-1"
          )}
          onClick={() => { if (window.innerWidth < 1024) onClose(); }}
        >
          {isCollapsed ? (
            <div className="flex h-8 w-8 items-center justify-center">
              <img src={iconsidePng} alt="Icon" className="h-full w-full object-contain" />
            </div>
          ) : (
            <div className="flex h-12 w-auto items-center justify-center">
              <img src={logoMainPng} alt="Logo" className="h-full w-auto object-contain" />
            </div>
          )}
          {!isCollapsed && (
            <span className="text-xs font-bold tracking-wider text-zinc-500 dark:text-zinc-400 whitespace-nowrap uppercase">
              Admin Dashboard
            </span>
          )}
        </Link>

        {/* Mobile close button */}
        {!isCollapsed && (
          <button
            onClick={onClose}
            className="absolute top-2 right-2 lg:hidden flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 transition-colors focus-visible:outline-none"
            aria-label="Close Sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1 lg:py-3 no-scrollbar">
        {!isCollapsed && (
          <div className="px-4 mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 whitespace-nowrap">
            Overview
          </div>
        )}

        <nav className="flex flex-col gap-0.5 px-2">
          {/* Top items: Dashboard, Files */}
          {TOP_NAV.map((item) => (
            <NavLink key={item.to} item={item} isCollapsed={isCollapsed} onClose={onClose} />
          ))}

          {/* Storage Manager collapsible group */}
          <CollapsibleGroup isCollapsed={isCollapsed} onClose={onClose} label="Storage Manager" icon={HardDrive} children={STORAGE_CHILDREN} prefixes={STORAGE_PREFIXES} />

          {/* Bottom items: Users, Logs, API */}
          {BOTTOM_NAV.map((item) => (
            <NavLink key={item.to} item={item} isCollapsed={isCollapsed} onClose={onClose} />
          ))}

          {/* Settings collapsible group */}
          <CollapsibleGroup isCollapsed={isCollapsed} onClose={onClose} label="Settings" icon={Settings} children={SETTINGS_CHILDREN} prefixes={SETTINGS_PREFIXES} />

          {/* Trash — always last */}
          <NavLink item={{ label: "Trash", to: "/dashboard/trash", icon: Trash2 }} isCollapsed={isCollapsed} onClose={onClose} />
        </nav>
      </div>

      {/* User footer */}
      <LoadingOverlay visible={isLoggingOut} message="Keluar..." />
      <div className="border-t border-zinc-200 dark:border-zinc-800 p-3">
        <div className={cn("flex items-center gap-3 rounded-lg px-2 py-2", isCollapsed && "justify-center px-0")}>
          <div className="h-9 w-9 md:h-10 md:w-10 shrink-0 rounded-full bg-brand-50 border border-brand-200 dark:border-brand-800 dark:bg-brand-900/30 flex items-center justify-center shadow-sm overflow-hidden">
            <img
              src={getAvatarSvg(user?.username || user?.email || "Admin")}
              key={avatarKey}
              alt={user?.username || "Avatar"}
              className="h-full w-full object-cover"
            />
          </div>
          {!isCollapsed && (
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {user?.username ?? "Admin"}
              </span>
              <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                {user?.email ?? "—"}
              </span>
            </div>
          )}
          {!isCollapsed && (
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="rounded-lg p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all shrink-0"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut className="h-4.5 w-4.5" />
            </button>
          )}
        </div>
        {isCollapsed && (
          <div className="mt-2 flex justify-center">
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="rounded-lg p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN SIDEBAR ─────────────────────────────────────────────────────────────
export function AppSidebar() {
  const { isOpen, setIsOpen } = useSidebar();
  const isDesktop = typeof window !== "undefined" && window.innerWidth >= 1024;

  const handleClose = React.useCallback(() => setIsOpen(false), [setIsOpen]);

  return (
    <>
      {/* ── DESKTOP sidebar: sticky, smooth width transition ── */}
      <aside
        className={cn(
          "hidden lg:flex flex-col h-[100dvh] sticky top-0 shrink-0 z-50",
          "bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800",
          "transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          isOpen ? "w-60" : "w-[4.5rem]"
        )}
      >
        <SidebarContent isCollapsed={!isOpen} onClose={handleClose} />
      </aside>

      {/* ── MOBILE backdrop + drawer ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="mobile-backdrop"
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            onClick={handleClose}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.aside
            key="mobile-drawer"
            className="fixed inset-y-0 left-0 z-50 w-60 flex flex-col lg:hidden
                       bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 shadow-2xl"
            initial={{ x: -240, opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -240, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
            style={{ willChange: "transform, opacity" }}
          >
            <SidebarContent isCollapsed={false} onClose={handleClose} />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── MOBILE collapsed icon bar (always visible on mobile) ── */}
      <aside
        className={cn(
          "flex lg:hidden flex-col h-[100dvh] sticky top-0 shrink-0 z-30 w-14",
          "bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800",
          isOpen ? "invisible" : "visible"
        )}
      >
        <SidebarContent isCollapsed={true} onClose={handleClose} />
      </aside>
    </>
  );
}


