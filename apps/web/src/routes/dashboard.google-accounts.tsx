import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/google-accounts")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/storage-manager" });
  },
});
