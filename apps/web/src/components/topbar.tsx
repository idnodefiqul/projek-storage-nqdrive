import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Sun, Moon, LogOut } from "lucide-react";
import { Button } from "@nqdrive/ui";
import { useTheme } from "../stores/theme-provider";
import { useLogout } from "../hooks/auth";
import { SidebarTrigger } from "./sidebar";
import { LoadingOverlay } from "./overlay";

export function Topbar() {
  const { theme, toggleTheme } = useTheme();
  const logout = useLogout();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout.mutateAsync();
      // Brief delay so the overlay animation is visible before navigating
      setTimeout(() => {
        navigate({ to: "/login" });
      }, 1200);
    } catch {
      setIsLoggingOut(false);
    }
  };

  return (
    <>
      <LoadingOverlay visible={isLoggingOut} message="Keluar..." />

      <header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950">
        {/* Kiri: SidebarTrigger */}
        <SidebarTrigger />

        {/* Kanan: actions */}
        <div className="flex items-center gap-2 ml-auto">
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle tema">
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </Button>

          <Button variant="ghost" size="icon" onClick={handleLogout} disabled={isLoggingOut} aria-label="Logout">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>
    </>
  );
}
