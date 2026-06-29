import { createFileRoute } from "@tanstack/react-router";
import { HardDrive, FolderOpen, UserCircle2, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Skeleton, Progress } from "@nqdrive/ui";
import { formatBytes } from "@nqdrive/shared";
import { useStorageManagerSummary } from "../hooks/use-drive-accounts";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardOverviewPage,
});

function DashboardOverviewPage() {
  const { data: summary, isLoading } = useStorageManagerSummary();

  const stats = [
    {
      label: "Total Storage",
      value: summary ? formatBytes(summary.totalStorageBytes) : null,
      icon: HardDrive,
    },
    {
      label: "Total File",
      value: summary ? String(summary.totalFiles) : null,
      icon: FolderOpen,
    },
    {
      label: "Akun Google Drive",
      value: summary ? `${summary.onlineAccounts}/${summary.totalAccounts} online` : null,
      icon: UserCircle2,
    },
    {
      label: "Total Download",
      value: summary ? String(summary.totalDownloads) : null,
      icon: Download,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Dashboard</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Ringkasan penggunaan NQDRIVE Anda.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
                <stat.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{stat.label}</p>
                {isLoading || !stat.value ? (
                  <Skeleton className="mt-1 h-5 w-20" />
                ) : (
                  <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{stat.value}</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Penggunaan Storage</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading || !summary ? (
            <Skeleton className="h-3 w-full" />
          ) : (
            <div className="flex flex-col gap-2">
              <Progress value={summary.usedPercentage} />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {formatBytes(summary.usedStorageBytes)} dari {formatBytes(summary.totalStorageBytes)} terpakai (
                {summary.usedPercentage.toFixed(1)}%)
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
