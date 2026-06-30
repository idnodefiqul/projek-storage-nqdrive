import { createFileRoute } from "@tanstack/react-router";
import { HardDrive, File, Folder as FolderIcon, Activity, UserCircle2, Download } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Progress,
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
  Badge
} from "@nqdrive/ui";
import { motion, AnimatePresence } from "framer-motion";
import { formatBytes } from "@nqdrive/shared";
import { useDashboardMetrics } from "../hooks/use-dashboard";
import { useMinLoading } from "../hooks/use-min-loading";
import type { FileEntity, Folder } from "@nqdrive/types";
import { DashboardAnalyticsChart } from "../components/dashboard-analytics-chart";
import { PageTransition } from "../components/page-transition";
import { DashboardIndexSkeleton } from "../components/skeletons";

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] } },
};

export const Route = createFileRoute("/dashboard/")({
  component: DashboardOverviewPage,
});

function DashboardOverviewPage() {
  const { data: metrics, isLoading: isQueryLoading } = useDashboardMetrics();
  const isLoading = useMinLoading(isQueryLoading, 600);
  const summary = metrics?.summary;

  const stats = [
    {
      label: "Total Storage",
      value: summary ? formatBytes(summary.totalStorageBytes) : null,
      icon: HardDrive,
      color: "text-blue-500",
    },
    {
      label: "Total File",
      value: summary ? String(summary.totalFiles) : null,
      icon: File,
      color: "text-emerald-500",
    },
    {
      label: "Google Drive Accounts",
      value: summary ? `${summary.onlineAccounts}/${summary.totalAccounts} Online` : null,
      icon: UserCircle2,
      color: "text-amber-500",
    },
    {
      label: "Total Download",
      value: summary ? String(summary.totalDownloads) : null,
      icon: Download,
      color: "text-indigo-500",
    },
  ];

  if (isLoading) {
    return (
      <PageTransition>
        <DashboardIndexSkeleton />
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-8 pb-8"
      >
      <motion.div variants={itemVariants}>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Dashboard</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Ringkasan penggunaan dan metrik NQDRIVE Anda.</p>
      </motion.div>

      {/* Analytics Chart */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        <DashboardAnalyticsChart />
      </motion.div>

      <motion.div variants={containerVariants} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <motion.div key={stat.label} variants={itemVariants}>
            <Card className="overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  {stat.label}
                </CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <AnimatePresence mode="wait">
                  {!stat.value ? (
                    <motion.div key="skel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <Skeleton className="mt-1 h-7 w-24" />
                    </motion.div>
                  ) : (
                    <motion.div key="val" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{stat.value}</div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      <motion.div variants={containerVariants} className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        <Card className="col-span-1 lg:col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              File Paling Sering Di-download
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border dark:border-zinc-800">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama File</TableHead>
                    <TableHead>Ukuran</TableHead>
                    <TableHead className="text-right">Downloads</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-[200px]" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
                        <TableCell className="text-right flex justify-end"><Skeleton className="h-4 w-[40px]" /></TableCell>
                      </TableRow>
                    ))
                  ) : metrics?.topDownloadedFiles && metrics.topDownloadedFiles.length > 0 ? (
                    metrics.topDownloadedFiles.map((file: FileEntity) => (
                      <TableRow key={file.id}>
                        <TableCell className="font-medium max-w-[200px] sm:max-w-[300px] truncate" title={file.filename}>
                          {file.filename}
                        </TableCell>
                        <TableCell className="text-zinc-500 whitespace-nowrap">{formatBytes(file.sizeBytes)}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="neutral">{file.downloadCount}</Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="h-24 text-center text-zinc-500">
                        Belum ada data download.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-1 lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              Penggunaan Storage
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading || !summary ? (
              <div className="space-y-4 mt-2">
                <Skeleton className="h-8 w-[150px]" />
                <Skeleton className="h-3 w-full" />
                <div className="grid grid-cols-2 gap-4">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex items-end justify-between mt-2">
                  <div>
                    <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
                      {formatBytes(summary.usedStorageBytes)}
                    </div>
                    <div className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                      dari {formatBytes(summary.totalStorageBytes)} terpakai
                    </div>
                  </div>
                  <div className="text-xl font-semibold text-brand-600 dark:text-brand-400">
                    {summary.usedPercentage.toFixed(1)}%
                  </div>
                </div>
                <Progress value={summary.usedPercentage} className="h-3 mt-2" />
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                    <div className="text-sm font-medium text-zinc-500">Kapasitas Sisa</div>
                    <div className="mt-2 text-xl font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatBytes(summary.availableStorageBytes)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                    <div className="text-sm font-medium text-zinc-500">Total File</div>
                    <div className="mt-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                      {summary.totalFiles}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={containerVariants} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <File className="h-4 w-4" />
              File Terbaru
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center space-x-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-[80%]" />
                      <Skeleton className="h-3 w-[40%]" />
                    </div>
                  </div>
                ))
              ) : metrics?.recentFiles && metrics.recentFiles.length > 0 ? (
                metrics.recentFiles.map((file: FileEntity) => (
                  <div key={file.id} className="flex items-center space-x-4 p-2 -mx-2 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800">
                      <File className="h-4 w-4 text-zinc-500" />
                    </div>
                    <div className="flex-1 space-y-1 overflow-hidden">
                      <p className="text-sm font-medium leading-none truncate text-zinc-900 dark:text-zinc-100" title={file.filename}>
                        {file.filename}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {formatBytes(file.sizeBytes)} • {new Date(file.createdAt).toLocaleDateString("id-ID")}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-sm text-zinc-500 py-6">Belum ada file.</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderIcon className="h-4 w-4" />
              Folder Terbaru
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center space-x-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-[60%]" />
                      <Skeleton className="h-3 w-[30%]" />
                    </div>
                  </div>
                ))
              ) : metrics?.recentFolders && metrics.recentFolders.length > 0 ? (
                metrics.recentFolders.map((folder: Folder) => (
                  <div key={folder.id} className="flex items-center space-x-4 p-2 -mx-2 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border border-brand-100 dark:border-brand-900/30">
                      <FolderIcon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 space-y-1 overflow-hidden">
                      <p className="text-sm font-medium leading-none truncate text-zinc-900 dark:text-zinc-100" title={folder.name}>
                        {folder.name}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {new Date(folder.createdAt).toLocaleDateString("id-ID")}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-sm text-zinc-500 py-6">Belum ada folder.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
      </motion.div>
    </PageTransition>
  );
}
