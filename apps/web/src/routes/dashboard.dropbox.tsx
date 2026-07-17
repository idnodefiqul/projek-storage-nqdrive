import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/dropbox")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/storage" });
  },
});
