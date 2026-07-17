import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout dokumentasi — hanya meneruskan ke child route (index / google-drive / drop-box).
export const Route = createFileRoute("/dashboard/documentation")({
  component: () => <Outlet />,
});
