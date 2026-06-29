import { Link, useLocation } from "@tanstack/react-router";
import { X } from "lucide-react";
import {
  LayoutDashboard,
  FolderOpen,
  Upload,
  Folder,
  HardDrive,
  UserCircle2,
  Users,
  ScrollText,
  Webhook,
  Settings,
} from "lucide-react";
import { NqdriveLogo, cn } from "@nqdrive/ui";

const NAV_ITEMS = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Files", to: "/dashboard/files", icon: FolderOpen },
  { label: "Storage Manager", to: "/dashboard/storage-manager", icon: HardDrive },
  { label: "Google Accounts", to: "/dashboard/google-accounts", icon: UserCircle2 },
  { label: "Users", to: "/dashboard/users", icon: Users },
  { label: "Logs", to: "/dashboard/logs", icon: ScrollText },
  { label: "API", to: "/dashboard/api", icon: Webhook },
  { label: "Settings", to: "/dashboard/settings", icon: Settings },
] as const;

interface SidebarInnerProps {
  onClose?: () => void;
}

/** Isi sidebar yang dipakai bersama oleh desktop dan mobile */
function SidebarInner({ onClose }: SidebarInnerProps) {
  const location = useLocation();

  return (
    <div className="flex h-full flex-col">
      {/* Logo header */}
      <div className="flex h-16 items-center justify-between border-b border-zinc-200 px-4 dark:border-zinc-800">
        <Link to="/dashboard" className="flex items-center gap-2.5" onClick={onClose}>
          {/* Logo icon selalu tampil */}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 ring-1 ring-brand-500/20">
            <NqdriveLogo className="h-5 w-5" />
          </div>
          <span className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            NQ<span className="text-brand-600 dark:text-brand-400">DRIVE</span>
          </span>
        </Link>

        {/* Tombol tutup — hanya tampil di mobile */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.to === "/dashboard"
              ? location.pathname === "/dashboard"
              : location.pathname.startsWith(item.to);
          const Icon = item.icon;

          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  isActive
                    ? "text-brand-600 dark:text-brand-400"
                    : "text-zinc-400 group-hover:text-zinc-600"
                )}
              />
              {item.label}
              {isActive && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-500" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer version */}
      <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-xs text-zinc-400">NQDRIVE v0.1.0</p>
      </div>
    </div>
  );
}

/** Desktop sidebar — fixed, hanya tampil di lg+ */
export function Sidebar() {
  return (
    <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 lg:flex">
      <SidebarInner />
    </aside>
  );
}

/** Mobile sidebar drawer — slide dari kiri dengan backdrop */
interface MobileSidebarProps {
  open: boolean;
  onClose: () => void;
}

export function MobileSidebar({ open, onClose }: MobileSidebarProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-zinc-950/60 backdrop-blur-sm transition-all duration-300 lg:hidden",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
      />

      {/* Drawer panel */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 flex-col border-r border-zinc-200 bg-white shadow-2xl transition-transform duration-300 ease-in-out dark:border-zinc-800 dark:bg-zinc-950 lg:hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <SidebarInner onClose={onClose} />
      </aside>
    </>
  );
}
