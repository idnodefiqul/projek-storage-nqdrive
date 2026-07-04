import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { HardDrive, File, Folder as FolderIcon, UserCircle2, Download, BarChart3, Globe } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@nqdrive/ui";
import { motion } from "framer-motion";
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

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 4) return local[0] + "***@" + domain;
  return local.substring(0, 4) + "***@" + domain;
}

const ACCOUNT_COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#14b8a6",
];

function useApexChart() {
  const [Chart, setChart] = useState<any>(null);
  useEffect(() => {
    let mounted = true;
    import("react-apexcharts").then(m => {
      if (mounted) setChart(() => m.default);
    });
    return () => { mounted = false; };
  }, []);
  return Chart;
}

function StoragePolarChart({ accountsStorage }: { accountsStorage: { email: string; usedStorageBytes: number; totalStorageBytes: number }[] }) {
  const Chart = useApexChart();
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  const labels = accountsStorage.map(a => maskEmail(a.email));
  const seriesData = accountsStorage.map(a => +(a.usedStorageBytes / (1024 * 1024 * 1024)).toFixed(2));
  const colors = accountsStorage.map((_, i) => ACCOUNT_COLORS[i % ACCOUNT_COLORS.length]!);

  const options = useMemo((): any => ({
    chart: {
      type: "polarArea",
      background: "transparent",
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    },
    theme: { mode: isDark ? "dark" : "light" },
    labels,
    colors,
    fill: { opacity: 0.8 },
    stroke: { width: 1, colors: [isDark ? "#18181b" : "#ffffff"] },
    plotOptions: {
      polarArea: {
        rings: { strokeWidth: 1, strokeColor: isDark ? "#27272a" : "#e4e4e7" },
        spokes: { strokeWidth: 1, connectorColors: isDark ? "#27272a" : "#e4e4e7" },
      },
    },
    legend: {
      position: "bottom",
      horizontalAlign: "left",
      labels: { colors: isDark ? "#a1a1aa" : "#52525b" },
      fontSize: "11px",
      markers: { size: 5, shape: "circle" },
      itemMargin: { horizontal: 8, vertical: 4 },
    },
    tooltip: {
      theme: isDark ? "dark" : "light",
      y: { formatter: (val: number) => val.toFixed(2) + " GB" },
    },
    yaxis: { show: false },
    dataLabels: { enabled: false },
  }), [isDark, labels, colors]);

  if (!Chart) return <Skeleton className="h-[300px] w-full rounded-xl" />;
  if (accountsStorage.length === 0) {
    return <div className="flex h-[300px] items-center justify-center text-sm text-zinc-400">Belum ada akun.</div>;
  }
  return <Chart options={options} series={seriesData} type="polarArea" height={300} />;
}

function TopDownloadedChart({ files }: { files: FileEntity[] }) {
  const Chart = useApexChart();
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  const sorted = [...files].sort((a, b) => b.downloadCount - a.downloadCount).slice(0, 10);
  const names = sorted.map(f => f.filename);
  const counts = sorted.map(f => f.downloadCount);

  const truncate = (s: string, max: number) => s.length > max ? s.substring(0, max) + "\u2026" : s;

  const options = useMemo((): any => ({
    chart: {
      type: "bar",
      toolbar: { show: false },
      background: "transparent",
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    },
    theme: { mode: isDark ? "dark" : "light" },
    colors: ["#6366f1"],
    plotOptions: {
      bar: {
        borderRadius: 4,
        columnWidth: "55%",
        dataLabels: { position: "top" },
      },
    },
    dataLabels: {
      enabled: true,
      formatter: (val: number) => val + "x",
      offsetY: -20,
      style: {
        fontSize: "11px",
        fontWeight: 600,
        colors: [isDark ? "#a1a1aa" : "#52525b"],
      },
    },
    xaxis: {
      categories: names.map(n => truncate(n, 10)),
      labels: {
        style: { colors: isDark ? "#71717a" : "#a1a1aa", fontSize: "10px" },
        rotate: -45,
        rotateAlways: names.length > 4,
        trim: true,
        maxHeight: 80,
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: { style: { colors: isDark ? "#71717a" : "#a1a1aa", fontSize: "11px" } },
    },
    grid: {
      borderColor: isDark ? "#27272a" : "#e4e4e7",
      strokeDashArray: 3,
      xaxis: { lines: { show: false } },
    },
    tooltip: {
      theme: isDark ? "dark" : "light",
      custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
        const file = sorted[dataPointIndex];
        if (!file) return "";
        const fn = file.filename.length > 40 ? file.filename.substring(0, 40) + "\u2026" : file.filename;
        return '<div style="padding:8px 12px;font-size:12px;max-width:220px;word-wrap:break-word;">'
          + '<div style="font-weight:600;margin-bottom:4px;">' + fn + '</div>'
          + '<div style="color:' + (isDark ? "#a1a1aa" : "#71717a") + ';">' + formatBytes(file.sizeBytes) + '</div>'
          + '<div style="margin-top:2px;font-weight:600;color:#6366f1;">' + file.downloadCount + 'x download</div>'
          + '</div>';
      },
    },
    legend: { show: false },
  }), [isDark, names, counts, sorted]);

  const series = [{ name: "Download", data: counts }];

  if (!Chart) return <Skeleton className="h-[320px] w-full rounded-xl" />;
  if (files.length === 0) {
    return <div className="flex h-[320px] items-center justify-center text-sm text-zinc-400">Belum ada data download.</div>;
  }
  return <Chart options={options} series={series} type="bar" height={320} />;
}

function CountryFlag({ code }: { code: string }) {
  const lower = code.toLowerCase();
  return (
    <img
      src={`https://flagcdn.com/w40/${lower}.png`}
      alt={code}
      className="h-4 w-5 rounded-sm object-cover shrink-0"
      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );
}

function DashboardOverviewPage() {
  const { data: metrics, isLoading: isQueryLoading } = useDashboardMetrics();
  const isLoading = useMinLoading(isQueryLoading, 600);
  const summary = metrics?.summary;

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
        className="flex flex-col gap-6 pb-8"
      >
      <motion.div variants={itemVariants}>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Dashboard</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Ringkasan penggunaan dan metrik {import.meta.env.VITE_SITE_NAME || "NQDRIVE"} Anda.</p>
      </motion.div>

      {/* Row 1: 3 stat cards - taller */}
      <motion.div variants={containerVariants} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: "Total Storage", value: summary ? formatBytes(summary.totalStorageBytes) : "\u2014", icon: HardDrive, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-900/20" },
          { label: "Total File", value: summary ? String(summary.totalFiles) : "\u2014", icon: File, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
          { label: "Google Drive Accounts", value: summary ? `${summary.onlineAccounts}/${summary.totalAccounts} Online` : "\u2014", icon: UserCircle2, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-900/20" },
        ].map((stat) => (
          <motion.div key={stat.label} variants={itemVariants}>
            <Card className="overflow-hidden">
              <div className="p-6 pb-8">
                <div className="flex items-center justify-between mb-6">
                  <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{stat.label}</p>
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${stat.bg}`}>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                </div>
                <div className="text-4xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">{stat.value}</div>
              </div>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Row 2: Spline Area chart (left) + Total Download + top countries (right) */}
      <motion.div variants={containerVariants} className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        <DashboardAnalyticsChart />
        <Card className="col-span-1 lg:col-span-2">
          <div className="p-6 flex flex-col h-full">
            <div className="flex items-center gap-2 mb-4">
              <Download className="h-4 w-4 text-indigo-500" />
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Total Download</p>
            </div>
            <div className="text-4xl font-bold text-zinc-900 dark:text-zinc-50 mb-1">
              {summary ? String(summary.totalDownloads) : "\u2014"}
            </div>
            <p className="text-xs text-zinc-400 mb-5">All Download</p>

            {metrics?.topCountries && metrics.topCountries.length > 0 && (
              <div className="mt-auto">
                <div className="flex items-center gap-1.5 mb-3">
                  <Globe className="h-3.5 w-3.5 text-zinc-400" />
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Top Negara</p>
                </div>
                <div className="space-y-2">
                  {metrics.topCountries.slice(0, 5).map((c) => {
                    const pct = summary && summary.totalDownloads > 0 ? (c.count / summary.totalDownloads) * 100 : 0;
                    return (
                      <div key={c.country} className="flex items-center gap-2">
                        <CountryFlag code={c.country} />
                        <span className="text-xs text-zinc-600 dark:text-zinc-400 uppercase font-medium w-7">{c.country}</span>
                        <div className="flex-1 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.max(pct, 2)}%` }} />
                        </div>
                        <span className="text-[10px] text-zinc-500 tabular-nums w-8 text-right">{c.count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </Card>
      </motion.div>

      {/* Row 3: Penggunaan Storage (left) + File Paling Sering Di-download (right) */}
      <motion.div variants={containerVariants} className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        <Card className="col-span-1 lg:col-span-3" style={{ contain: "layout style" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              Penggunaan Storage
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summary && metrics?.accountsStorage ? (
              <StoragePolarChart accountsStorage={metrics.accountsStorage} />
            ) : (
              <Skeleton className="h-[300px] w-full rounded-xl" />
            )}
          </CardContent>
        </Card>

        <Card className="col-span-1 lg:col-span-4 overflow-hidden" style={{ contain: "layout style" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              File Paling Sering Di-download
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TopDownloadedChart files={metrics?.topDownloadedFiles ?? []} />
          </CardContent>
        </Card>
      </motion.div>

      {/* Row 4: File Terbaru + Folder Terbaru */}
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
              {metrics?.recentFiles && metrics.recentFiles.length > 0 ? (
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
                        {formatBytes(file.sizeBytes)} &#x2022; {new Date(file.createdAt).toLocaleDateString("id-ID")}
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
              {metrics?.recentFolders && metrics.recentFolders.length > 0 ? (
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