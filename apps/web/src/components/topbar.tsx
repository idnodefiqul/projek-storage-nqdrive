import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Sun, Moon, LogOut, Palette } from "lucide-react";
import { Button } from "@nqdrive/ui";
import { useTheme } from "../stores/theme-provider";
import { useLogout } from "../hooks/auth";
import { useUpdateSettings } from "../hooks/use-settings";
import { SidebarTrigger } from "./sidebar";
import { LoadingOverlay } from "./overlay";
import { ThemeSidebar } from "./theme-sidebar";

export function Topbar() {
  const { theme, toggleTheme, brandColor, setThemeSidebarOpen } = useTheme();
  const logout = useLogout();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const updateSettings = useUpdateSettings();

  const handleToggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    toggleTheme();
    updateSettings.mutate({ theme_mode: next, brand_color: brandColor });
  };

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

  return (
    <>
      <LoadingOverlay visible={isLoggingOut} message="Keluar..." />
      <ThemeSidebar />

      <header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950">
        <SidebarTrigger />

        <div className="flex items-center gap-1 ml-auto">
          <Button variant="ghost" size="icon" onClick={handleToggleTheme} aria-label="Toggle tema">
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </Button>

          <Button variant="ghost" size="icon" onClick={() => setThemeSidebarOpen(true)} aria-label="Theme">
            <Palette className="h-4 w-4" />
          </Button>

          <Button variant="ghost" size="icon" onClick={handleLogout} disabled={isLoggingOut} aria-label="Logout">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>
    </>
  );
}