import * as React from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { cn, NqdriveLogo } from "@nqdrive/ui";
import {
  LayoutDashboard,
  FolderOpen,
  HardDrive,
  UserCircle2,
  Users,
  ScrollText,
  Webhook,
  Settings,
  Menu,
  X,
  Trash2,
} from "lucide-react";
import { getAvatarSvg } from "../lib/avatar";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthContext } from "../stores/auth-provider";
import { useTrashCount } from "../hooks/use-trash";

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
const NAV_ITEMS = [
  { label: "Dashboard",       to: "/dashboard",                 icon: LayoutDashboard },
  { label: "Files",           to: "/dashboard/files",           icon: FolderOpen },
  { label: "Storage Manager", to: "/dashboard/storage-manager", icon: HardDrive },
  { label: "Google Accounts", to: "/dashboard/google-accounts", icon: UserCircle2 },
  { label: "Users",           to: "/dashboard/users",           icon: Users },
  { label: "Logs",            to: "/dashboard/logs",            icon: ScrollText },
  { label: "API",             to: "/dashboard/api",             icon: Webhook },
  { label: "Settings",        to: "/dashboard/settings",        icon: Settings },
  { label: "Trash",           to: "/dashboard/trash",           icon: Trash2 },
] as const;

// ─── SIDEBAR CONTENT (shared between desktop collapsed & mobile drawer) ────────
function SidebarContent({
  isCollapsed,
  onClose,
}: {
  isCollapsed: boolean;
  onClose: () => void;
}) {
  const location = useLocation();
  const { data: trashCountData } = useTrashCount();
  const { user } = useAuthContext();
  const trashCount = trashCountData?.count ?? 0;

  const FADE = { duration: 0.15, ease: [0.4, 0, 0.2, 1] } as const;

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
            // Di mobile, geser konten sedikit ke atas (negative margin) tanpa merusak tinggi container
            "lg:mt-0",
            isCollapsed ? "-mt-2" : "-mt-1"
          )}
          onClick={() => { if (window.innerWidth < 1024) onClose(); }}
        >
          {isCollapsed ? (
            <div className="flex h-8 w-8 items-center justify-center">
              <img src="/iconside.png" alt="Icon" className="h-full w-full object-contain" />
            </div>
          ) : (
            <div className="flex h-12 w-auto items-center justify-center">
              <img src="/logopage.png" alt="Logo" className="h-full w-auto object-contain" />
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
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.to === "/dashboard"
                ? location.pathname === "/dashboard"
                : location.pathname.startsWith(item.to);
            const isTrash = item.to === "/dashboard/trash";

            return (
              <Link
                key={item.to}
                to={item.to}
                title={isCollapsed ? item.label : undefined}
                onClick={() => { if (window.innerWidth < 1024) onClose(); }}
                className={cn(
                  "group relative flex items-center rounded-lg transition-colors duration-150",
                  isCollapsed
                    ? "justify-center h-10 w-10 mx-auto"
                    : "px-3 py-2.5 gap-3",
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
                    isCollapsed ? "h-5 w-5" : "h-4 w-4",
                    isActive
                      ? isTrash
                        ? "text-red-600 dark:text-red-400"
                        : "text-brand-600 dark:text-brand-400"
                      : "text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300"
                  )}
                />
                {!isCollapsed && (
                  <span className="truncate text-sm flex-1">{item.label}</span>
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
          })}
        </nav>
      </div>

      {/* User footer */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 p-3">
        <div className={cn("flex items-center gap-3 rounded-lg px-2 py-2", isCollapsed && "justify-center px-0")}>
          <div className="h-9 w-9 md:h-10 md:w-10 shrink-0 rounded-full bg-brand-50 border border-brand-200 dark:border-brand-800 dark:bg-brand-900/30 flex items-center justify-center shadow-sm overflow-hidden">
            <img 
              src={getAvatarSvg(user?.username || user?.email || "Admin")} 
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
        </div>
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
      {/* ── DESKTOP sidebar: sticky, never hidden, just narrow/wide ── */}
      <aside
        className={cn(
          "hidden lg:flex flex-col h-[100dvh] sticky top-0 shrink-0 z-50",
          "bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800",
          // Width switches instantly — no transition. Content fades instead.
          isOpen ? "w-60" : "w-[4.5rem]"
        )}
      >
        <SidebarContent isCollapsed={!isOpen} onClose={handleClose} />
      </aside>

      {/* ── MOBILE backdrop + drawer ── */}
      {/* Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="mobile-backdrop"
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            onClick={handleClose}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Drawer — slides in from left using translateX only (GPU, no reflow) */}
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            key="mobile-drawer"
            className="fixed inset-y-0 left-0 z-50 w-60 flex flex-col lg:hidden
                       bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 shadow-2xl"
            initial={{ x: -240, opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -240, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
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
          // Hide when drawer is open to avoid overlap
          isOpen ? "invisible" : "visible"
        )}
      >
        <SidebarContent isCollapsed={true} onClose={handleClose} />
      </aside>
    </>
  );
}
