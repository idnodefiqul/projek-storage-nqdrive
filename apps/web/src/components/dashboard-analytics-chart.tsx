import { useMemo } from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Skeleton } from "@nqdrive/ui";
import { ArrowDownToLine, ArrowUpFromLine, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { useDashboardAnalytics } from "../hooks/use-dashboard";
import { SectionCard, ChartTooltip, CHART_COLORS } from "./ui-kit";
import { formatLocal } from "../lib/datetime";

type Period = 7 | 30 | 90;

function formatDate(dateStr: string, period: Period): string {
  if (period === 7) return formatLocal(dateStr + "T00:00:00Z", { weekday: "short", day: "numeric" });
  return formatLocal(dateStr + "T00:00:00Z", { day: "numeric", month: "short" });
}

function trendPct(values: number[]): number {
  if (values.length < 2) return 0;
  const mid = Math.floor(values.length / 2);
  const prev = values.slice(0, mid).reduce((s, v) => s + v, 0);
  const curr = values.slice(mid).reduce((s, v) => s + v, 0);
  if (prev === 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

export function DashboardAnalyticsChart({
  period,
  onPeriodChange,
}: {
  period: Period;
  onPeriodChange: (p: Period) => void;
}) {
  const { data: analytics, isLoading } = useDashboardAnalytics(period);

  const chartData = analytics?.chartData ?? [];
  const data = chartData.map((d) => ({
    name: formatDate(d.date, period),
    download: d.downloads,
    upload: d.uploads,
  }));

  const downloads = chartData.map((d) => d.downloads);
  const uploads = chartData.map((d) => d.uploads);
  const totalDl = downloads.reduce((s, v) => s + v, 0);
  const totalUp = uploads.reduce((s, v) => s + v, 0);
  const dlTrend = trendPct(downloads);

  const PERIODS: { label: string; value: Period }[] = [
    { label: "7H", value: 7 },
    { label: "30H", value: 30 },
    { label: "90H", value: 90 },
  ];

  const tickInterval = useMemo(() => {
    if (period === 7) return 0;
    if (period === 30) return 3;
    return 9;
  }, [period]);

  const periodToggle = (
    <div className="flex shrink-0 items-center gap-1 rounded-xl border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface-muted))]/60 p-1">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          onClick={() => onPeriodChange(p.value)}
          className={
            "rounded-lg px-2.5 py-1 text-xs font-bold transition-colors " +
            (period === p.value
              ? "bg-[rgb(var(--surface))] text-brand-600 shadow-[var(--shadow-card)] dark:text-brand-300"
              : "text-[rgb(var(--ink-500))] hover:text-[rgb(var(--foreground))]")
          }
        >
          {p.label}
        </button>
      ))}
    </div>
  );

  return (
    <SectionCard title="Analitik Aktivitas" icon={Activity} action={periodToggle} className="h-full" bodyClassName="p-5">
      {/* Ringkasan seri */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500/10 text-brand-600 ring-1 ring-brand-500/15 dark:text-brand-300">
            <ArrowDownToLine className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="font-display text-lg font-extrabold tabular tracking-tight text-[rgb(var(--foreground))]">{totalDl.toLocaleString("id-ID")}</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[rgb(var(--ink-500))]">Download</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[rgb(var(--surface-muted))] text-[rgb(var(--ink-500))] ring-1 ring-[rgb(var(--border-subtle))]">
            <ArrowUpFromLine className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="font-display text-lg font-extrabold tabular tracking-tight text-[rgb(var(--foreground))]">{totalUp.toLocaleString("id-ID")}</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[rgb(var(--ink-500))]">Upload</p>
          </div>
        </div>
        <span
          className={
            "ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold " +
            (dlTrend >= 0
              ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300"
              : "bg-rose-500/12 text-rose-600 dark:text-rose-300")
          }
        >
          {dlTrend >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          {Math.abs(dlTrend).toFixed(0)}%
        </span>
      </div>

      <div className="mt-5 h-[300px] w-full sm:h-[380px]">
        {isLoading ? (
          <Skeleton className="h-full w-full rounded-2xl" />
        ) : data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm font-medium text-[rgb(var(--ink-500))]">
            Belum ada data aktivitas.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 6, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="areaDownload" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.brand} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={CHART_COLORS.brand} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="4 4" vertical={false} />
              <XAxis
                dataKey="name" interval={tickInterval}
                tick={{ fill: "rgb(var(--ink-500))", fontWeight: 600, fontSize: 12 }}
                tickLine={false} axisLine={false} dy={10}
              />
              <YAxis
                width={44}
                tick={{ fill: "rgb(var(--ink-500))", fontWeight: 600, fontSize: 12 }}
                tickLine={false} axisLine={false}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: CHART_COLORS.grid, strokeWidth: 1.5, strokeDasharray: "4 4" }} />
              <Area
                type="monotone" dataKey="download" name="Download" stroke={CHART_COLORS.brand}
                strokeWidth={2.5} fill="url(#areaDownload)" fillOpacity={1}
                activeDot={{ r: 5, fill: CHART_COLORS.brand, stroke: "rgb(var(--surface))", strokeWidth: 2 }} dot={false}
              />
              <Line
                type="monotone" dataKey="upload" name="Upload" stroke={CHART_COLORS.ink}
                strokeWidth={2} strokeDasharray="5 4"
                activeDot={{ r: 5, fill: CHART_COLORS.ink, stroke: "rgb(var(--surface))", strokeWidth: 2 }} dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </SectionCard>
  );
}
