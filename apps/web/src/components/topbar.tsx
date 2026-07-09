import { Palette, Send } from "lucide-react";
import { Button, AnimatedThemeToggle } from "@nqdrive/ui";
import { useTheme } from "../stores/theme-provider";
import { useUpdateSettings } from "../hooks/use-settings";
import { SidebarTrigger } from "./sidebar";
import { ThemeSidebar } from "./theme-sidebar";
import { UploadSidebar } from "./upload-sidebar";
import { useUploadGlobal } from "../stores/upload-provider";
import { useMigrationGlobal } from "../stores/migration-provider";

export function Topbar() {
  const { theme, toggleTheme, brandColor, setThemeSidebarOpen } = useTheme();
  const { items, setUploadSidebarOpen } = useUploadGlobal();
  const { activeJobs: migrationJobs } = useMigrationGlobal();
  const updateSettings = useUpdateSettings();

  const handleToggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    toggleTheme();
    updateSettings.mutate({ theme_mode: next, brand_color: brandColor });
  };

  // Count active upload items (only uploading, exclude queued)
  const activeItems = items.filter(
    (i) => i.status === "uploading"
  );
  // Migrasi drive yang berjalan ikut dihitung di badge + ring progress
  const activeCount = activeItems.length + migrationJobs.length;

  const totalBytes =
    activeItems.reduce((s, i) => s + i.progress.totalBytes, 0) +
    migrationJobs.reduce((s, j) => s + j.totalBytes, 0);
  const uploadedBytes =
    activeItems.reduce((s, i) => s + i.progress.uploadedBytes, 0) +
    migrationJobs.reduce((s, j) => s + j.migratedBytes, 0);
  const overallPercent = totalBytes > 0 ? (uploadedBytes / totalBytes) * 100 : 0;

  // SVG circle calculations for circular progress indicator
  const radius = 11;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (overallPercent / 100) * circumference;

  return (
    <>
      <ThemeSidebar />
      <UploadSidebar />

      <header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950">
        <SidebarTrigger />

        <div className="flex items-center gap-1 ml-auto">
          <AnimatedThemeToggle theme={theme} onToggle={handleToggleTheme} />

          <Button variant="ghost" size="icon" onClick={() => setThemeSidebarOpen(true)} aria-label="Theme">
            <Palette className="h-4 w-4" />
          </Button>

          {/* Progress Upload Button with Pixel-Perfect Circular Ring */}
          <button
            onClick={() => setUploadSidebarOpen(true)}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 transition-colors shrink-0"
            aria-label="Progress Upload & Migrasi"
          >
            {activeCount > 0 ? (
              <>
                {/* Center align SVG and wrap the icon perfectly */}
                <svg viewBox="0 0 36 36" className="absolute h-9 w-9 -rotate-90 animate-spin-slow">
                  <circle
                    cx="18"
                    cy="18"
                    r={radius}
                    className="stroke-zinc-200 dark:stroke-zinc-800/60"
                    strokeWidth="2"
                    fill="transparent"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r={radius}
                    className="stroke-brand-500"
                    strokeWidth="2"
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                  />
                </svg>
                {/* Slightly larger, static icon (no bounce) */}
                <Send className="h-[18px] w-[18px] text-brand-500 relative z-10" />
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-sm shadow-red-500/30">
                  {activeCount}
                </span>
              </>
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>
      </header>
    </>
  );
}