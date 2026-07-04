import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from "@nqdrive/ui";
import { useDashboardAnalytics } from "../hooks/use-dashboard";

type Period = 7 | 30 | 90;

function formatDate(dateStr: string, period: Period): string {
  const d = new Date(dateStr + "T00:00:00");
  if (period === 7) {
    return d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric" });
  }
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

export function DashboardAnalyticsChart() {
  const [period, setPeriod] = useState<Period>(30);
  const { data: analytics, isLoading } = useDashboardAnalytics(period);
  const [Chart, setChart] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    import("react-apexcharts").then(m => {
      if (mounted) setChart(() => m.default);
    });
    return () => { mounted = false; };
  }, []);

  const chartData = analytics?.chartData ?? [];
  const categories = chartData.map(d => formatDate(d.date, period));
  const downloads = chartData.map(d => d.downloads);
  const uploads = chartData.map(d => d.uploads);

  const PERIODS: { label: string; value: Period }[] = [
    { label: "7H", value: 7 },
    { label: "30H", value: 30 },
    { label: "90H", value: 90 },
  ];

  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  const options = useMemo((): any => ({
    chart: {
      type: "area",
      toolbar: { show: false },
      zoom: { enabled: false },
      background: "transparent",
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      animations: { enabled: true, easing: "easeinout", speed: 600, dynamicAnimation: { enabled: false } },
      selection: { enabled: false },
      redrawOnParentResize: true,
      redrawOnWindowResize: true,
    },
    theme: { mode: isDark ? "dark" : "light" },
    colors: ["#6366f1", "#10b981"],
    dataLabels: { enabled: false },
    stroke: { curve: "smooth", width: 2.5 },
    fill: {
      type: "gradient",
      gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.05, stops: [0, 90, 100] },
    },
    xaxis: {
      categories,
      labels: { style: { colors: isDark ? "#71717a" : "#a1a1aa", fontSize: "11px" } },
      axisBorder: { show: false },
      axisTicks: { show: false },
      tickAmount: period === 7 ? 7 : period === 30 ? 8 : 10,
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
      x: { show: true },
    },
    legend: {
      position: "top",
      horizontalAlign: "right",
      labels: { colors: isDark ? "#a1a1aa" : "#52525b" },
      fontSize: "12px",
      markers: { size: 5, shape: "circle" },
    },
  }), [isDark, categories, period]);

  const series = [
    { name: "Download", data: downloads },
    { name: "Upload", data: uploads },
  ];

  return (
    <Card className="col-span-1 lg:col-span-5" style={{ contain: "layout style" }}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-4">
        <div className="min-w-0">
          <CardTitle className="text-lg font-semibold">Analitik Aktivitas</CardTitle>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Download &amp; upload dalam {period} hari terakhir
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-700 p-1 bg-zinc-50 dark:bg-zinc-800/50">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                period === p.value
                  ? "bg-white dark:bg-zinc-900 shadow text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading || !Chart ? (
          <Skeleton className="h-[260px] w-full rounded-xl" />
        ) : chartData.length === 0 ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-zinc-400">
            Belum ada data aktivitas.
          </div>
        ) : (
          <Chart options={options} series={series} type="area" height={260} />
        )}
      </CardContent>
    </Card>
  );
}