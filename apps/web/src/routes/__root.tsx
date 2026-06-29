import { createRootRoute, Outlet } from "@tanstack/react-router";

/**
 * Root layout. Sidebar, topbar, theme provider, and auth guards will be added
 * here in Tahap 7 (Frontend Dashboard). Kept minimal for now (Tahap 1 scaffolding).
 */
export const Route = createRootRoute({
  component: () => <Outlet />,
});
