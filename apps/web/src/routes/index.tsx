import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSetupStatus } from "../hooks/use-auth";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

/**
 * Entry redirect: checks first-run setup status, then routes to /setup, /login, or
 * /dashboard accordingly. No UI of its own — purely a routing decision point.
 */
function IndexPage() {
  const navigate = useNavigate();
  const { data: setupStatus, isLoading } = useSetupStatus();

  useEffect(() => {
    if (isLoading) return;
    navigate({ to: setupStatus?.setupCompleted ? "/login" : "/setup", replace: true });
  }, [isLoading, setupStatus, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white dark:bg-zinc-950">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
    </div>
  );
}
