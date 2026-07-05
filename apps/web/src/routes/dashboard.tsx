import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "../components/dashboard-layout";
import { AuthProvider } from "../stores/auth-provider";
import { UploadProvider } from "../stores/upload-provider";

export const Route = createFileRoute("/dashboard")({
  component: () => (
    <AuthProvider>
      <UploadProvider>
        <DashboardLayout />
      </UploadProvider>
    </AuthProvider>
  ),
});
