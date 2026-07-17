import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/storage-manager")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/storage" });
  },
});
