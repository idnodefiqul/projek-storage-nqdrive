import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/cloudflare-r2")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/storage" });
  },
});
