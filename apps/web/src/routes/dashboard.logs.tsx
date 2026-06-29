import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { Card, CardContent, Badge, Skeleton, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@nqdrive/ui";
import { formatBytes } from "@nqdrive/shared";
import { useUploadLogs, useDownloadLogs } from "../hooks/use-logs-and-api-keys";

export const Route = createFileRoute("/dashboard/logs")({
  component: LogsPage,
});

const STATUS_VARIANT: Record<string, "success" | "destructive" | "warning" | "neutral"> = {
  success: "success", completed: "success",
  failed: "destructive", cancelled: "neutral", partial: "warning",
};

function LogsPage() {
  const [tab, setTab] = useState<"uploads" | "downloads">("uploads");
  const uploadLogs = useUploadLogs();
  const downloadLogs = useDownloadLogs();

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Logs</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Riwayat aktivitas upload dan download.</p>
      </div>

      {/* FIX: Tab pakai background brand agar kelihatan di light mode */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("uploads")}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            tab === "uploads"
              ? "bg-brand-500 text-white shadow-sm shadow-brand-500/25"
              : "border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          }`}
        >
          <Upload className="h-4 w-4" />
          Upload Logs
        </button>
        <button
          type="button"
          onClick={() => setTab("downloads")}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            tab === "downloads"
              ? "bg-brand-500 text-white shadow-sm shadow-brand-500/25"
              : "border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          }`}
        >
          <Download className="h-4 w-4" />
          Download Logs
        </button>
      </div>

      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardContent className="flex flex-1 flex-col overflow-hidden p-0">
          {tab === "uploads" ? (
            uploadLogs.isLoading ? (
              <div className="p-5"><Skeleton className="h-40 w-full" /></div>
            ) : (
              <div className="flex-1 overflow-auto">
                <table className="w-full caption-bottom text-sm">
                  <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60">
                    <tr>
                      {["Nama File", "Ukuran", "Durasi", "Status", "Waktu"].map((h) => (
                        <th key={h} className="h-10 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {uploadLogs.data?.logs.map((log) => (
                      <tr key={log.id} className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                        <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">{log.filename}</td>
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{formatBytes(log.size_bytes)}</td>
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{(log.duration_ms / 1000).toFixed(1)}s</td>
                        <td className="px-4 py-3"><Badge variant={STATUS_VARIANT[log.status] ?? "neutral"}>{log.status}</Badge></td>
                        <td className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">{new Date(log.created_at).toLocaleString("id-ID")}</td>
                      </tr>
                    ))}
                    {uploadLogs.data?.logs.length === 0 && (
                      <tr><td colSpan={5} className="py-16 text-center text-sm text-zinc-400">Belum ada riwayat upload.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )
          ) : downloadLogs.isLoading ? (
            <div className="p-5"><Skeleton className="h-40 w-full" /></div>
          ) : (
            <div className="flex-1 overflow-auto">
              <table className="w-full caption-bottom text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60">
                  <tr>
                    {["Nama File", "IP Address", "Bytes Terkirim", "Status", "Waktu"].map((h) => (
                      <th key={h} className="h-10 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {downloadLogs.data?.logs.map((log) => (
                    <tr key={log.id} className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                      <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">{log.filename ?? "(file dihapus)"}</td>
                      <td className="px-4 py-3 font-mono text-sm text-zinc-500 dark:text-zinc-400">{log.ip_address}</td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{formatBytes(log.bytes_served)}</td>
                      <td className="px-4 py-3"><Badge variant={STATUS_VARIANT[log.status] ?? "neutral"}>{log.status}</Badge></td>
                      <td className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">{new Date(log.created_at).toLocaleString("id-ID")}</td>
                    </tr>
                  ))}
                  {downloadLogs.data?.logs.length === 0 && (
                    <tr><td colSpan={5} className="py-16 text-center text-sm text-zinc-400">Belum ada riwayat download.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
