import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Activity, ShieldCheck, AlertTriangle, XCircle, LogIn, Users,
  Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Download, Copy, Eye, ArrowUpDown, Filter, X, ChevronDown, Loader2,
  TrendingUp, TrendingDown,
} from "lucide-react";
import {
  Badge, Button, Input,
  Card,
  Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@nqdrive/ui";
import { cn } from "@nqdrive/ui";
import { motion, AnimatePresence } from "framer-motion";
import { PageTransition } from "../components/page-transition";
import { PageHeader, SectionCard } from "../components/ui-kit";
import { apiRequest } from "../lib/client";
import { formatLocal, formatInTimezone, getUserTimeZone } from "../lib/datetime";

export const Route = createFileRoute("/dashboard/audit-logs")({
  component: AuditLogsPage,
});

type LogStatus = "success" | "warning" | "error" | "info";

function getAuditLogId(l: { logId?: string | null } | null | undefined): string {
  return l?.logId ?? "";
}

interface AuditLogEntry {
  logId: string;
  status: LogStatus;
  action: string;
  user: string;
  ip: string;
  country: string;
  timezone: string;
  user_agent: string;
  detail: string | null;
  created_at: string;
}

interface StatsResponse {
  total: number;
  success: number;
  warning: number;
  error: number;
  info: number;
  trend: { date: string; events: number }[];
}

function getBrowser(ua: string): string {
  if (!ua) return "-";
  if (ua.includes("Edg") || ua.includes("Edge")) return "Edge";
  if (ua.includes("Chrome") && !ua.includes("Edg")) return "Chrome";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
  if (ua.includes("OPR") || ua.includes("Opera")) return "Opera";
  return ua.slice(0, 20) + (ua.length > 20 ? "…" : "");
}

function getOS(ua: string): string {
  if (!ua) return "-";
  if (ua.includes("Windows NT 10")) return "Windows 10";
  if (ua.includes("Windows NT 11")) return "Windows 11";
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Mac OS X") || ua.includes("macOS")) return "macOS";
  if (ua.includes("Linux") && !ua.includes("Android")) return "Linux";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("iOS") || ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
  return ua.slice(0, 20);
}

const STATUS_MAP: Record<LogStatus, { variant: "success" | "warning" | "destructive" | "default"; label: string }> = {
  success: { variant: "success", label: "Success" },
  warning: { variant: "warning", label: "Warning" },
  error: { variant: "destructive", label: "Error" },
  info: { variant: "default", label: "Info" },
};

function StatusBadge({ status }: { status: LogStatus }) {
  const { variant, label } = STATUS_MAP[status];
  return <Badge variant={variant} className="text-[10px] px-2 py-0.5">{label}</Badge>;
}

function StatCard({ label, value, icon: Icon, color, change, index }: {
  label: string; value: number; icon: React.ElementType; color: string; change: number; index: number;
}) {
  const isPositive = change > 0;
  const isNeutral = change === 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05, ease: [0.4, 0, 0.2, 1] }}
    >
      <Card className="p-4 sm:p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-[rgb(var(--ink-500))] truncate">{label}</p>
            <p className="mt-1.5 text-xl sm:font-display text-2xl font-extrabold tracking-tight text-[rgb(var(--foreground))] tabular-nums">{value.toLocaleString()}</p>
          </div>
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--surface-muted))]", color)}>
            <Icon className="h-4.5 w-4.5" />
          </div>
        </div>
        {!isNeutral && (
          <div className="mt-3 flex items-center gap-1">
            {isPositive ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> : <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
            <span className={cn("text-[11px] font-semibold", isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
              {isPositive ? "+" : ""}{change.toFixed(1)}%
            </span>
            <span className="text-[11px] text-[rgb(var(--ink-500))]">vs yesterday</span>
          </div>
        )}
      </Card>
    </motion.div>
  );
}

interface FilterState {
  status: string;
  user: string;
  action: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: FilterState = { status: "", user: "", action: "", dateFrom: "", dateTo: "" };

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--ink-500))]">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full appearance-none rounded-lg border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] px-3 pr-8 text-sm text-[rgb(var(--foreground))] outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:focus:border-brand-500/60"
        >
          <option value="">All</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[rgb(var(--ink-500))]" />
      </div>
    </div>
  );
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCSV(logs: AuditLogEntry[]) {
  const headers = ["ID","Status","Action","User","IP","Country","Browser","OS","Timestamp"];
  const rows = logs.map((l) => [getAuditLogId(l), l.status, l.action, l.user, l.ip, l.country, getBrowser(l.user_agent), getOS(l.user_agent), l.created_at].join(","));
  downloadFile([headers.join(","), ...rows].join("\n"), `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv");
}

function exportJSON(logs: AuditLogEntry[]) {
  downloadFile(JSON.stringify(logs, null, 2), `audit-logs-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
}

function AuditLogsPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [sorting, setSorting] = useState<SortingState>([{ id: "created_at", desc: true }]);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [copied, setCopied] = useState(false);

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(() => {
    if (typeof window === "undefined") return 21;
    if (window.innerWidth < 640) return 12;
    if (window.innerWidth >= 1024) return 21;
    return 15;
  });

  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  const [filterOptions, setFilterOptions] = useState<{ actions: string[]; users: string[] }>({ actions: [], users: [] });

  const activeFilterCount = useMemo(() => Object.values(filters).filter(Boolean).length, [filters]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    const params = new URLSearchParams();
    params.set("limit", String(pageSize));
    params.set("offset", String(pageIndex * pageSize));
    if (filters.status) params.set("status", filters.status);
    if (filters.user) params.set("user", filters.user);
    if (filters.action) params.set("action", filters.action);
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (debouncedSearch) params.set("search", debouncedSearch);

    apiRequest<{ logs: AuditLogEntry[]; total: number }>(`/audit-logs?${params}`)
      .then((res) => {
        if (!cancelled) {
          setLogs(res.logs);
          setTotal(res.total);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [pageIndex, pageSize, filters, debouncedSearch]);

  useEffect(() => {
    let cancelled = false;
    apiRequest<StatsResponse>("/audit-logs/stats")
      .then((res) => {
        if (!cancelled) setStats(res);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoadingStats(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ actions: string[]; users: string[] }>("/audit-logs/filters")
      .then((res) => {
        if (!cancelled) setFilterOptions(res);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setSearch(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(v);
      setPageIndex(0);
    }, 300);
  };

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  const setFilter = useCallback((key: keyof FilterState, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPageIndex(0);
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setSearch("");
    setDebouncedSearch("");
    setPageIndex(0);
  }, []);

  const statCards = useMemo((): { label: string; value: number; icon: React.ElementType; color: string; change: number }[] => {
    if (!stats) return [];
    const t = stats.trend;
    const yesterday = t.length >= 2 ? t[t.length - 1]!.events : 0;
    const prevDay = t.length >= 3 ? t[t.length - 2]!.events : 0;
    const trendChange = prevDay > 0 ? ((yesterday - prevDay) / prevDay) * 100 : 0;
    return [
      { label: "Total Events", value: stats.total, icon: Activity, color: "text-brand-500", change: Math.round(trendChange * 10) / 10 },
      { label: "Success", value: stats.success, icon: ShieldCheck, color: "text-emerald-500", change: 0 },
      { label: "Warning", value: stats.warning, icon: AlertTriangle, color: "text-amber-500", change: 0 },
      { label: "Error", value: stats.error, icon: XCircle, color: "text-red-500", change: 0 },
      { label: "Info", value: stats.info, icon: LogIn, color: "text-blue-500", change: 0 },
      { label: "Active Sessions", value: 4, icon: Users, color: "text-blue-500", change: 0 },
    ];
  }, [stats]);

  const trendData = useMemo(() => stats?.trend ?? [], [stats]);

  const severityData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: "Success", value: stats.success, color: "#10b981" },
      { name: "Info", value: stats.info, color: "#3b82f6" },
      { name: "Warning", value: stats.warning, color: "#f59e0b" },
      { name: "Error", value: stats.error, color: "#ef4444" },
    ];
  }, [stats]);

  const columns = useMemo<ColumnDef<AuditLogEntry>[]>(() => [
    {
      accessorKey: "status",
      header: "Status",
      size: 90,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "action",
      header: ({ column }) => (
        <button className="flex items-center gap-1 hover:text-[rgb(var(--ink-500))] dark:hover:text-[rgb(var(--foreground))] transition-colors" onClick={() => column.toggleSorting()}>
          Action <ArrowUpDown className="h-3 w-3" />
        </button>
      ),
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.action}</span>,
    },
    {
      accessorKey: "user",
      header: "User",
      size: 100,
      cell: ({ row }) => <span className="font-medium">{row.original.user}</span>,
    },
    {
      accessorKey: "ip",
      header: "IP Address",
      size: 130,
      cell: ({ row }) => <span className="font-mono text-xs text-[rgb(var(--ink-500))]">{row.original.ip}</span>,
    },
    { accessorKey: "country", header: "Country", size: 110 },
    {
      id: "browser",
      header: "Browser",
      size: 110,
      cell: ({ row }) => <span className="text-xs">{getBrowser(row.original.user_agent)}</span>,
    },
    {
      accessorKey: "created_at",
      header: ({ column }) => (
        <button className="flex items-center gap-1 hover:text-[rgb(var(--ink-500))] dark:hover:text-[rgb(var(--foreground))] transition-colors" onClick={() => column.toggleSorting()}>
          Timestamp <ArrowUpDown className="h-3 w-3" />
        </button>
      ),
      size: 190,
      cell: ({ row }) => {
        const tz = row.original.timezone || getUserTimeZone();
        const ipTime = row.original.timezone ? formatInTimezone(row.original.created_at, row.original.timezone) : formatLocal(row.original.created_at);
        return (
          <div className="flex flex-col">
            <span className="font-mono text-[11px] text-[rgb(var(--foreground))] whitespace-nowrap">{ipTime}</span>
            {row.original.timezone && (
              <span className="text-[9px] text-[rgb(var(--ink-500))] truncate max-w-[160px]">{row.original.timezone}</span>
            )}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "",
      size: 80,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(JSON.stringify(row.original, null, 2));
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="rounded-md p-1.5 text-[rgb(var(--ink-500))] hover:text-[rgb(var(--ink-500))] hover:bg-[rgb(var(--surface-muted))] dark:hover:text-[rgb(var(--foreground))] transition-colors"
            title="Copy log"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedLog(row.original);
            }}
            className="rounded-md p-1.5 text-[rgb(var(--ink-500))] hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/30 dark:hover:text-brand-400 transition-colors"
            title="View detail"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ], []);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const table = useReactTable({
    data: logs,
    columns,
    pageCount,
    state: { sorting, pagination: { pageIndex, pageSize } },
    onSortingChange: setSorting,
    onPaginationChange: (updater) => {
      const next = typeof updater === "function" ? updater({ pageIndex, pageSize }) : updater;
      setPageIndex(next.pageIndex);
      setPageSize(next.pageSize);
    },
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <PageTransition>
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Settings"
          icon={ShieldCheck}
          title="Audit Logs"
          description="Monitor and review all system activity and security events."
        />

        {isLoadingStats ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="p-4 sm:p-5">
                <div className="h-[72px] animate-pulse rounded-lg bg-[rgb(var(--surface-muted))]" />
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {statCards.map((card, i) => (
              <StatCard key={card.label} {...card} index={i} />
            ))}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.15 }} className="lg:col-span-2">
            <SectionCard title="Activity Trend" icon={Activity} bodyClassName="p-4 sm:p-5">
              <div className="h-[220px] sm:h-[260px]">
                {trendData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-[rgb(var(--ink-500))]">No trend data yet</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-[rgb(var(--border-subtle))]" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} className="fill-[rgb(var(--ink-500))]" />
                      <YAxis tick={{ fontSize: 11 }} className="fill-[rgb(var(--ink-500))]" />
                      <RechartsTooltip contentStyle={{ borderRadius: 12, border: "1px solid rgb(var(--border-subtle))", fontSize: 12, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }} />
                      <Line type="monotone" dataKey="events" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </SectionCard>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.2 }}>
            <SectionCard title="Event Severity" icon={ShieldCheck} className="h-full" bodyClassName="p-4 sm:p-5">
              <div className="h-[220px] sm:h-[260px]">
                {severityData.length === 0 || severityData.every((d) => d.value === 0) ? (
                  <div className="flex h-full items-center justify-center text-sm text-[rgb(var(--ink-500))]">No events yet</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={severityData} cx="50%" cy="45%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value" stroke="none">
                        {severityData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Legend verticalAlign="bottom" iconType="circle" iconSize={8} formatter={(value: string) => <span className="text-xs text-[rgb(var(--ink-500))]">{value}</span>} />
                      <RechartsTooltip contentStyle={{ borderRadius: 12, border: "1px solid rgb(var(--border-subtle))", fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </SectionCard>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.25 }}>
          <Card className="p-3 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-1 items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--ink-500))]" />
                  <Input
                    placeholder="Search logs..."
                    value={search}
                    onChange={handleSearchChange}
                    className="h-9 pl-9 text-sm"
                  />
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)} className={cn("h-9 gap-1.5", showFilters && "border-brand-500 text-brand-600 dark:text-brand-400")}>
                  <Filter className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Filters</span>
                  {activeFilterCount > 0 && (
                    <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">{activeFilterCount}</span>
                  )}
                </Button>
                {activeFilterCount > 0 && (
                  <button onClick={handleClearFilters} className="text-xs text-[rgb(var(--ink-500))] hover:text-[rgb(var(--ink-500))] dark:hover:text-[rgb(var(--foreground))] transition-colors flex items-center gap-1">
                    <X className="h-3 w-3" /> Clear
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs" onClick={() => exportCSV(logs)}>
                  <Download className="h-3.5 w-3.5" /> CSV
                </Button>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs" onClick={() => exportJSON(logs)}>
                  <Download className="h-3.5 w-3.5" /> JSON
                </Button>
              </div>
            </div>

            <AnimatePresence>
              {showFilters && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }} className="overflow-hidden">
                  <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[rgb(var(--border-subtle))] pt-3 dark:border-[rgb(var(--border-subtle))] sm:grid-cols-3 lg:grid-cols-5">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--ink-500))]">Date From</label>
                      <input type="date" value={filters.dateFrom} onChange={(e) => setFilter("dateFrom", e.target.value)} className="h-9 w-full rounded-lg border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] px-3 text-sm text-[rgb(var(--foreground))] outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-[rgb(var(--border-subtle))] dark:bg-[rgb(var(--surface))] dark:text-[rgb(var(--foreground))]" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--ink-500))]">Date To</label>
                      <input type="date" value={filters.dateTo} onChange={(e) => setFilter("dateTo", e.target.value)} className="h-9 w-full rounded-lg border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] px-3 text-sm text-[rgb(var(--foreground))] outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-[rgb(var(--border-subtle))] dark:bg-[rgb(var(--surface))] dark:text-[rgb(var(--foreground))]" />
                    </div>
                    <FilterSelect label="Status" value={filters.status} onChange={(v) => setFilter("status", v)} options={["success","warning","error","info"]} />
                    <FilterSelect label="User" value={filters.user} onChange={(v) => setFilter("user", v)} options={filterOptions.users} />
                    <FilterSelect label="Action" value={filters.action} onChange={(v) => setFilter("action", v)} options={filterOptions.actions} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.3 }}>
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id} className="bg-[rgb(var(--surface-muted))]/80 dark:bg-[rgb(var(--surface))]/60">
                    {hg.headers.map((header) => (
                      <TableHead key={header.id} style={{ width: header.getSize() }}>
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-32 text-center">
                      <div className="flex items-center justify-center gap-2 text-sm text-[rgb(var(--ink-500))]">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading logs...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-32 text-center text-sm text-[rgb(var(--ink-500))]">
                      No logs found matching your criteria.
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id} className="cursor-pointer" onClick={() => setSelectedLog(row.original)}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <div className="flex flex-col items-center justify-between gap-3 border-t border-[rgb(var(--border-subtle))] px-4 py-3 dark:border-[rgb(var(--border-subtle))] sm:flex-row">
              <p className="text-xs text-[rgb(var(--ink-500))]">
                Showing{" "}
                <span className="font-semibold text-[rgb(var(--ink-500))] dark:text-[rgb(var(--foreground))]">{total === 0 ? 0 : pageIndex * pageSize + 1}</span>
                {" - "}
                <span className="font-semibold text-[rgb(var(--ink-500))] dark:text-[rgb(var(--foreground))]">{Math.min((pageIndex + 1) * pageSize, total)}</span>
                {" of "}
                <span className="font-semibold text-[rgb(var(--ink-500))] dark:text-[rgb(var(--foreground))]">{total}</span> logs
              </p>
              <div className="flex items-center gap-1.5">
                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPageIndex(0); }} className="h-8 rounded-lg border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] px-2 text-xs text-[rgb(var(--ink-500))] dark:border-[rgb(var(--border-subtle))] dark:bg-[rgb(var(--surface))] dark:text-[rgb(var(--foreground))]">
                  {[12, 21, 30, 50].map((size) => <option key={size} value={size}>{size} / page</option>)}
                </select>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setPageIndex(0)} disabled={pageIndex === 0}>
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setPageIndex((p) => p - 1)} disabled={pageIndex === 0}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="px-2 text-xs font-medium text-[rgb(var(--ink-500))] dark:text-[rgb(var(--ink-500))]">{pageIndex + 1} / {pageCount}</span>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setPageIndex((p) => p + 1)} disabled={pageIndex >= pageCount - 1}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setPageIndex(pageCount - 1)} disabled={pageIndex >= pageCount - 1}>
                  <ChevronsRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>

        <AnimatePresence>
          {copied && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed bottom-6 right-6 z-50 rounded-xl border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] px-4 py-2.5 text-sm font-medium text-[rgb(var(--foreground))] shadow-lg dark:border-[rgb(var(--border-subtle))] dark:bg-[rgb(var(--surface))] dark:text-[rgb(var(--foreground))]"
            >
              Copied to clipboard
            </motion.div>
          )}
        </AnimatePresence>

        <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)} className="max-w-lg">
          {selectedLog && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Log Detail
                  <StatusBadge status={selectedLog.status} />
                </DialogTitle>
              </DialogHeader>
              <DialogContent>
                <div className="grid gap-3 text-sm max-h-[60vh] overflow-y-auto pr-1">
                  {([
                    ["ID", getAuditLogId(selectedLog), true],
                    ["User", selectedLog.user, false],
                    ["Action", selectedLog.action, true],
                    ["IP Address", selectedLog.ip, true],
                    ["Country", selectedLog.country, false],
                    ["Browser", getBrowser(selectedLog.user_agent), false],
                    ["Operating System", getOS(selectedLog.user_agent), false],
                    ["User Agent", selectedLog.user_agent, false],
                    ["Detail", selectedLog.detail ?? "-", true],
                    ["Status", selectedLog.status, false],
                    ["Timezone IP", selectedLog.timezone || "-", false],
                    ["Timestamp (IP Time)", selectedLog.timezone ? formatInTimezone(selectedLog.created_at, selectedLog.timezone, { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : formatLocal(selectedLog.created_at, { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }), false],
                    ["Timestamp (Browser)", formatLocal(selectedLog.created_at, { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }), false],
                  ] as [string, string, boolean][]).map(([label, value, mono]) => (
                    <div key={label} className="flex items-start justify-between gap-4 border-b border-[rgb(var(--border-subtle))] pb-2.5 last:border-0 dark:border-[rgb(var(--border-subtle))]">
                      <span className="text-[rgb(var(--ink-500))] shrink-0">{label}</span>
                      <span className={cn("text-right text-[rgb(var(--foreground))] break-all", mono && "font-mono text-xs")}>{value}</span>
                    </div>
                  ))}
                </div>
              </DialogContent>
              <DialogFooter>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(selectedLog, null, 2));
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  <Copy className="h-3.5 w-3.5" /> Copy JSON
                </Button>
                <Button size="sm" onClick={() => setSelectedLog(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </Dialog>
      </div>
    </PageTransition>
  );
}
