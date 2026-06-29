import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, Badge, Progress, Skeleton } from "@nqdrive/ui";
import { formatBytes } from "@nqdrive/shared";
import { useStorageManagerSummary } from "../hooks/use-drive-accounts";

export const Route = createFileRoute("/dashboard/storage-manager")({
  component: StorageManagerPage,
});

function StorageManagerPage() {
  const { data: summary, isLoading } = useStorageManagerSummary();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Storage Manager</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Detail penggunaan storage di setiap akun Google Drive yang terhubung.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ringkasan Gabungan</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading || !summary ? (
            <Skeleton className="h-3 w-full" />
          ) : (
            <div className="flex flex-col gap-2">
              <Progress value={summary.usedPercentage} />
              <div className="flex justify-between text-sm text-zinc-500 dark:text-zinc-400">
                <span>{formatBytes(summary.usedStorageBytes)} terpakai</span>
                <span>{formatBytes(summary.availableStorageBytes)} tersisa</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {isLoading && Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-40" />)}

        {summary?.accounts.map((account) => (
          <Card key={account.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{account.email}</CardTitle>
                <Badge variant={account.status === "online" ? "success" : "destructive"}>
                  {account.status === "online" ? "Online" : "Offline"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                <Progress value={account.usedPercentage} />
                <div className="flex justify-between text-sm text-zinc-500 dark:text-zinc-400">
                  <span>{formatBytes(account.usedStorageBytes)} terpakai</span>
                  <span>{formatBytes(account.totalStorageBytes)} total</span>
                </div>
                {account.lastSyncedAt && (
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">
                    Sinkronisasi terakhir: {new Date(account.lastSyncedAt).toLocaleString("id-ID")}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {!isLoading && summary?.accounts.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Belum ada akun Google Drive yang terhubung. Tambahkan di halaman Google Accounts.
          </p>
        )}
      </div>
    </div>
  );
}
