import { Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { Suspense, useEffect } from "react";
import { SidebarProvider, AppSidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { useAuthContext } from "../stores/auth-provider";
import { useSettings } from "../hooks/use-settings";
import { AnimatePresence } from "framer-motion";
import { PageSkeleton } from "./skeletons";

/**
 * Wraps every /dashboard/* route.
 * - Uses Shadcn-like SidebarProvider for state
 * - AppSidebar handles both mobile sheet and desktop collapsible states
 */
export function DashboardLayout() {
  const { isAuthenticated, isLoading } = useAuthContext();
  useSettings();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate({ to: "/login" });
    }
  }, [isLoading, isAuthenticated, navigate]);

  // Saat auth masih loading, tampilkan full-page loading dalam shell layout
  // agar sidebar tidak blink/muncul sebelum waktunya
  if (isLoading) {
    return (
      <SidebarProvider>
        {/* Sidebar dummy saat loading — tidak ada konten user, hanya struktur */}
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden w-full relative">
          <div className="flex h-16 shrink-0 items-center border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="h-9 w-9 rounded-md bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
          </div>
          <main className="flex-1 overflow-y-auto p-4 sm:p-6">
            <PageSkeleton />
          </main>
        </div>
      </SidebarProvider>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <SidebarProvider>
      <AppSidebar />
      <div className="flex flex-1 flex-col overflow-hidden w-full relative" style={{ contain: "strict" }}>
        <Topbar />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Suspense fallback={<PageSkeleton />}>
            <AnimatePresence mode="wait">
              <Outlet key={location.pathname} />
            </AnimatePresence>
          </Suspense>
        </main>
      </div>
    </SidebarProvider>
  );
}

