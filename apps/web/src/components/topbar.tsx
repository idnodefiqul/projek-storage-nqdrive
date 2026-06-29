import { useNavigate } from "@tanstack/react-router";
import { Sun, Moon, LogOut, Menu } from "lucide-react";
import { Button } from "@nqdrive/ui";
import { useTheme } from "../stores/theme-provider";
import { useAuthContext } from "../stores/auth-provider";
import { useLogout } from "../hooks/use-auth";

interface TopbarProps {
  onMenuClick?: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuthContext();
  const logout = useLogout();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout.mutateAsync();
    navigate({ to: "/login" });
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950">
      {/* Kiri: hamburger hanya di mobile */}
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 lg:hidden"
        aria-label="Buka menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Di desktop, kiri kosong agar konten topbar tetap di kanan */}
      <div className="hidden lg:block" />

      {/* Kanan: actions */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle tema">
          {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>

        {user && (
          <span className="hidden rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 sm:inline">
            {user.username}
          </span>
        )}

        <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Logout">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
