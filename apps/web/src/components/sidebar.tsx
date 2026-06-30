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
} from "lucide-react";
import { useAuthContext } from "../stores/auth-provider";

// --- CONTEXT ---
const SidebarContext = React.createContext<{
  isOpen: boolean;
  setIsOpen: (React.Dispatch<React.SetStateAction<boolean>>);
}>({
  isOpen: false,
  setIsOpen: () => {},
});

export function useSidebar() {
  return React.useContext(SidebarContext);
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = React.useState(false);

  React.useEffect(() => {
    // Desktop: buka dari awal, Mobile: tutup dari awal (mode icon)
    const check = () => setIsOpen(window.innerWidth >= 1024);
    check();
  }, []);

  return (
    <SidebarContext.Provider value={{ isOpen, setIsOpen }}>
      <div className="flex h-screen overflow-hidden w-full bg-zinc-50 dark:bg-zinc-950">
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function SidebarTrigger({ className }: { className?: string }) {
  const { isOpen, setIsOpen } = useSidebar();
  return (
    <button
      onClick={() => setIsOpen((prev) => !prev)}
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-500",
        "hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition-colors overflow-hidden",
        className
      )}
      aria-label="Toggle Sidebar"
    >
      <Menu className={cn("absolute h-5 w-5 transition-all duration-300", isOpen ? "scale-0 opacity-0 -rotate-90" : "scale-100 opacity-100 rotate-0")} />
      <X className={cn("absolute h-5 w-5 transition-all duration-300", isOpen ? "scale-100 opacity-100 rotate-0" : "scale-0 opacity-0 rotate-90")} />
    </button>
  );
}

// --- NAV ITEMS ---
const NAV_ITEMS = [
  { label: "Dashboard",       to: "/dashboard",                 icon: LayoutDashboard },
  { label: "Files",           to: "/dashboard/files",           icon: FolderOpen },
  { label: "Storage Manager", to: "/dashboard/storage-manager", icon: HardDrive },
  { label: "Google Accounts", to: "/dashboard/google-accounts", icon: UserCircle2 },
  { label: "Users",           to: "/dashboard/users",           icon: Users },
  { label: "Logs",            to: "/dashboard/logs",            icon: ScrollText },
  { label: "API",             to: "/dashboard/api",             icon: Webhook },
  { label: "Settings",        to: "/dashboard/settings",        icon: Settings },
] as const;

// --- MAIN SIDEBAR ---
export function AppSidebar() {
  const { isOpen, setIsOpen } = useSidebar();
  const location = useLocation();
  const { user } = useAuthContext();

  const isCollapsed = !isOpen;

  return (
    <>
      {/* 
        Backdrop khusus mobile jika sidebar terbuka penuh (menghindari
        konten utama tergencet karena layar HP kecil) 
      */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "z-50 flex flex-col h-screen bg-white dark:bg-zinc-950",
          "border-r border-zinc-200 dark:border-zinc-800",
          "transition-all duration-300 ease-in-out shrink-0",
          // Mobile open: fixed ke viewport agar tidak bergerak saat scroll konten
          // Desktop: relative (bagian dari flex layout)
          isOpen
            ? "w-60 fixed inset-y-0 left-0 lg:sticky lg:top-0 shadow-2xl lg:shadow-none"
            : "sticky top-0 w-14 lg:w-[4.5rem]"
        )}
      >
        {/* Header */}
        <div
          className={cn(
            "flex h-16 shrink-0 items-center border-b border-zinc-200 dark:border-zinc-800 transition-all duration-300",
            isCollapsed ? "justify-center px-0" : "justify-between px-3"
          )}
        >
          <Link to="/dashboard" className="flex items-center gap-2 overflow-hidden">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 ring-1 ring-brand-500/20">
              <NqdriveLogo className="h-4 w-4" />
            </div>
            {!isCollapsed && (
              <span className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                NQ<span className="text-brand-600 dark:text-brand-400">DRIVE</span>
              </span>
            )}
          </Link>

          {/* Close Button for Mobile */}
          {!isCollapsed && (
            <button
              onClick={() => setIsOpen(false)}
              className="lg:hidden flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 transition-colors focus-visible:outline-none"
              aria-label="Close Sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-3 no-scrollbar">
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

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  title={isCollapsed ? item.label : undefined}
                  onClick={() => {
                    // Auto-close saat klik menu di mobile
                    if (window.innerWidth < 1024) setIsOpen(false);
                  }}
                  className={cn(
                    "group relative flex items-center rounded-lg transition-colors duration-150",
                    isCollapsed
                      ? "justify-center h-10 w-10 mx-auto"
                      : "px-3 py-2.5 gap-3",
                    isActive
                      ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400 font-medium"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-zinc-50"
                  )}
                >
                  <item.icon
                    className={cn(
                      "shrink-0 transition-colors",
                      isCollapsed ? "h-5 w-5" : "h-4 w-4",
                      isActive
                        ? "text-brand-600 dark:text-brand-400"
                        : "text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300"
                    )}
                  />
                  {!isCollapsed && (
                    <span className="truncate text-sm">{item.label}</span>
                  )}
                  {isActive && !isCollapsed && (
                    <div className="absolute right-2.5 h-1.5 w-1.5 rounded-full bg-brand-500" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User footer */}
        <div className="border-t border-zinc-200 dark:border-zinc-800 p-3">
          <div
            className={cn(
              "flex items-center gap-3 rounded-lg px-2 py-2",
              isCollapsed && "justify-center px-0"
            )}
          >
            {/* Avatar with initial */}
            <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-brand-400 to-emerald-500 flex items-center justify-center shadow-sm">
              <span className="text-xs font-bold text-white select-none">
                {(user?.username?.[0] ?? "A").toUpperCase()}
              </span>
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
      </aside>
    </>
  );
}
