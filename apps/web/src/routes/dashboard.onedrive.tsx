import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/onedrive")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/storage" });
  },
});
