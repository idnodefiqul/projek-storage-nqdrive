import { Outlet, useNavigate, useRouter } from "@tanstack/react-router";
import { Suspense, useEffect } from "react";
import { SidebarProvider, AppSidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { CommandPalette } from "./command-palette";
import { useAuthContext } from "../stores/auth-provider";
import { useSettings } from "../hooks/use-settings";
import { PageSkeleton } from "./skeletons";
import { GridPatternBackground } from "@nqdrive/ui";
import { ErrorBoundary } from "./error-boundary";

function Shell() {
  const { isAuthenticated, isLoading } = useAuthContext();
  useSettings();
  const navigate = useNavigate();
  const router = useRouter();

  useEffect(() => {
    document.body.classList.remove("logging-out");
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate({ to: "/login" });
  }, [isLoading, isAuthenticated, navigate]);

  // Prefetch important routes on idle to eliminate first-click delay
  useEffect(() => {
    if (!isAuthenticated) return;
    const idle = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined;
    const schedule = (cb: () => void) => {
      if (idle) return idle(cb, { timeout: 2000 });
      return window.setTimeout(cb, 1200) as unknown as number;
    };
    const id = schedule(() => {
      // Prefetch critical dashboard chunks
      router.preloadRoute({ to: "/dashboard/files" }).catch(() => {});
      router.preloadRoute({ to: "/dashboard" }).catch(() => {});
      router.preloadRoute({ to: "/dashboard/storage-manager" }).catch(() => {});
      router.preloadRoute({ to: "/dashboard/users" }).catch(() => {});
    });
    return () => {
      if (idle) {
        try {
          (window as any).cancelIdleCallback?.(id);
        } catch {}
      } else {
        clearTimeout(id as unknown as number);
      }
    };
  }, [isAuthenticated, router]);

  if (isLoading) {
    return (
      <>
        <div className="z-10 h-[72px] shrink-0 border-b border-[rgb(var(--border-subtle))]/70 glass-panel dark:border-white/10 lg:h-[88px]" />
        <div className="flex min-h-0 flex-1">
          <AppSidebar />
          <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden p-2.5 sm:p-4">
            <GridPatternBackground />
            <main className="dashboard-scroll scrollbar-hide flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)] sm:pb-2 lg:pb-2">
              <div className="mx-auto w-full max-w-[1520px]">
                <PageSkeleton />
              </div>
            </main>
          </div>
        </div>
      </>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <>
      <Topbar />
      <CommandPalette />
      <div className="flex min-h-0 flex-1">
        <AppSidebar />
        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden p-2.5 sm:p-4">
          <GridPatternBackground />
          <div className="pointer-events-none absolute -left-24 -top-24 -z-10 h-72 w-72 rounded-full bg-brand-500/[0.08] blur-3xl dark:bg-brand-500/[0.05]" />
          <div className="pointer-events-none absolute -right-16 top-40 -z-10 h-64 w-64 rounded-full bg-[var(--brand-b)]/[0.08] blur-3xl dark:bg-[var(--brand-b)]/[0.05]" />
          <main className="dashboard-scroll scrollbar-hide flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)] sm:pb-2 lg:pb-2">
            {/* Sentinel untuk IntersectionObserver — shadow header deteksi lebih murah daripada scroll listener */}
            <div id="dashboard-scroll-sentinel" className="h-px w-full shrink-0 pointer-events-none" aria-hidden />
            <div className="mx-auto flex min-h-full w-full max-w-[1520px] flex-col scrollbar-hide">
              <ErrorBoundary>
                <Suspense fallback={<PageSkeleton />}>
                  <Outlet />
                </Suspense>
              </ErrorBoundary>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}

export function DashboardLayout() {
  return (
    <SidebarProvider>
      <Shell />
    </SidebarProvider>
  );
}
