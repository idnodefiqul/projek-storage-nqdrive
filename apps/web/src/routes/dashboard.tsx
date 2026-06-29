import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "../components/dashboard-layout";
import { AuthProvider } from "../stores/auth-provider";

export const Route = createFileRoute("/dashboard")({
  component: () => (
    <AuthProvider>
      <DashboardLayout />
    </AuthProvider>
  ),
});
