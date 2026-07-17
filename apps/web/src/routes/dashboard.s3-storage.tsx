import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/s3-storage")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/storage" });
  },
});
