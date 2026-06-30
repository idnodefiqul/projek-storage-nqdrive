import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from "@nqdrive/ui";
import { useDashboardAnalytics, type ChartDataPoint } from "../hooks/use-dashboard";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

type Period = 7 | 30 | 90;

function formatDate(dateStr: string, period: Period): string {
  const d = new Date(dateStr + "T00:00:00");
  if (period === 7) {
    return d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric" });
  }
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl px-4 py-3 text-sm">
      <p className="font-semibold text-zinc-700 dark:text-zinc-300 mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-zinc-500 dark:text-zinc-400 capitalize">{p.name}:</span>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function TrendBadge({ data, key }: { data: ChartDataPoint[]; key: "downloads" | "uploads" }) {
  if (data.length < 2) return <Minus className="h-3 w-3 text-zinc-400" />;
  const half = Math.floor(data.length / 2);
  const prev = data.slice(0, half).reduce((s, d) => s + d[key], 0);
  const curr = data.slice(half).reduce((s, d) => s + d[key], 0);
  if (curr > prev) return <TrendingUp className="h-3 w-3 text-emerald-500" />;
  if (curr < prev) return <TrendingDown className="h-3 w-3 text-red-500" />;
  return <Minus className="h-3 w-3 text-zinc-400" />;
}

export function DashboardAnalyticsChart() {
  const [period, setPeriod] = useState<Period>(30);
  const { data: analytics, isLoading } = useDashboardAnalytics(period);

  const chartData = analytics?.chartData?.map((d) => ({
    ...d,
    label: formatDate(d.date, period),
  })) ?? [];

  const totalDownloads = chartData.reduce((s, d) => s + d.downloads, 0);
  const totalUploads = chartData.reduce((s, d) => s + d.uploads, 0);

  const PERIODS: { label: string; value: Period }[] = [
    { label: "7H", value: 7 },
    { label: "30H", value: 30 },
    { label: "90H", value: 90 },
  ];

  return (
    <Card className="col-span-1 lg:col-span-7">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-4">
        <div className="min-w-0">
          <CardTitle className="text-lg font-semibold">Analitik Aktivitas</CardTitle>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Download &amp; upload dalam {period} hari terakhir
          </p>
        </div>

        {/* Period selector */}
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
        {isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-[240px] w-full rounded-xl" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-[240px] items-center justify-center text-sm text-zinc-400">
            Belum ada data aktivitas.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradDownload" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradUpload" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="currentColor"
                className="text-zinc-200 dark:text-zinc-800"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                className="text-zinc-400"
                interval={period === 7 ? 0 : period === 30 ? 4 : 13}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                className="text-zinc-400"
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 12, paddingTop: 16 }}
                formatter={(value) =>
                  value === "downloads" ? "Download" : "Upload"
                }
              />
              <Area
                type="monotone"
                dataKey="downloads"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#gradDownload)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
              <Area
                type="monotone"
                dataKey="uploads"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#gradUpload)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
