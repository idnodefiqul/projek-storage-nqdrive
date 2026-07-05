import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useCallback } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Activity, ShieldCheck, AlertTriangle, XCircle, LogIn, Users,
  Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Download, Copy, Eye, ArrowUpDown, Filter, X, ChevronDown,
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

export const Route = createFileRoute("/dashboard/audit-logs")({
  component: AuditLogsPage,
});

type LogStatus = "success" | "warning" | "error" | "info";

interface AuditLogEntry {
  id: string;
  status: LogStatus;
  action: string;
  user: string;
  role: string;
  ip: string;
  country: string;
  device: string;
  browser: string;
  os: string;
  timestamp: string;
  method: string;
  endpoint: string;
  responseCode: number;
  requestId: string;
}

const ACTIONS = [
  "login","logout","file.upload","file.delete","file.download",
  "settings.update","user.create","user.delete","api-key.create",
  "api-key.revoke","storage.connect","storage.disconnect","password.change",
  "2fa.enable","2fa.disable","trash.purge","folder.create","folder.delete",
];
const USERS = ["admin","fiqul","operator1","devops"];
const COUNTRIES = ["Indonesia","Singapore","United States","Germany","Japan","Netherlands"];
const BROWSERS = ["Chrome 126","Firefox 128","Safari 18","Edge 126","Brave 1.67"];
const OS_LIST = ["Windows 11","macOS 15","Ubuntu 24.04","Android 14","iOS 18"];
const DEVICES = ["Desktop","Mobile","Tablet"];
const METHODS = ["GET","POST","PUT","PATCH","DELETE"];
const ENDPOINTS = [
  "/api/auth/login","/api/auth/logout","/api/upload","/api/files",
  "/api/folders","/api/settings","/api/security","/api/api-keys",
  "/api/storage","/api/trash","/api/dashboard","/api/me",
];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function generateDummyLogs(count: number): AuditLogEntry[] {
  const logs: AuditLogEntry[] = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const action = randomItem(ACTIONS);
    const isLogin = action === "login";
    const roll = Math.random();
    let status: LogStatus;
    if (isLogin && roll > 0.85) status = "error";
    else if (roll > 0.92) status = "warning";
    else if (roll > 0.96) status = "error";
    else if (roll > 0.82) status = "info";
    else status = "success";
    logs.push({
      id: `log-${String(i + 1).padStart(5, "0")}`,
      status,
      action,
      user: randomItem(USERS),
      role: "admin",
      ip: `${Math.floor(Math.random() * 223) + 1}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      country: randomItem(COUNTRIES),
      device: randomItem(DEVICES),
      browser: randomItem(BROWSERS),
      os: randomItem(OS_LIST),
      timestamp: new Date(now - i * 1000 * 60 * Math.floor(Math.random() * 30 + 1)).toISOString(),
      method: randomItem(METHODS),
      endpoint: randomItem(ENDPOINTS),
      responseCode: status === "error" ? randomItem([400,401,403,500]) : status === "warning" ? 429 : 200,
      requestId: `req_${Math.random().toString(36).slice(2, 14)}`,
    });
  }
  return logs;
}

const DUMMY_LOGS = generateDummyLogs(200);

const TREND_DATA = Array.from({ length: 14 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (13 - i));
  return {
    date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    events: Math.floor(Math.random() * 80 + 20),
  };
});

const SEVERITY_DATA = [
  { name: "Success", value: DUMMY_LOGS.filter((l) => l.status === "success").length, color: "#10b981" },
  { name: "Info", value: DUMMY_LOGS.filter((l) => l.status === "info").length, color: "#3b82f6" },
  { name: "Warning", value: DUMMY_LOGS.filter((l) => l.status === "warning").length, color: "#f59e0b" },
  { name: "Error", value: DUMMY_LOGS.filter((l) => l.status === "error").length, color: "#ef4444" },
];

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  change: number;
}

const STAT_CARDS: StatCardProps[] = [
  { label: "Total Events", value: DUMMY_LOGS.length, icon: Activity, color: "text-brand-500", change: 12.4 },
  { label: "Success", value: DUMMY_LOGS.filter((l) => l.status === "success").length, icon: ShieldCheck, color: "text-emerald-500", change: 8.2 },
  { label: "Warning", value: DUMMY_LOGS.filter((l) => l.status === "warning").length, icon: AlertTriangle, color: "text-amber-500", change: -3.1 },
  { label: "Error", value: DUMMY_LOGS.filter((l) => l.status === "error").length, icon: XCircle, color: "text-red-500", change: 2.7 },
  { label: "Failed Login", value: DUMMY_LOGS.filter((l) => l.action === "login" && l.status === "error").length, icon: LogIn, color: "text-rose-500", change: -5.0 },
  { label: "Active Sessions", value: 4, icon: Users, color: "text-blue-500", change: 0 },
];

function StatCard({ label, value, icon: Icon, color, change, index }: StatCardProps & { index: number }) {
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
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 truncate">{label}</p>
            <p className="mt-1.5 text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">{value.toLocaleString()}</p>
          </div>
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800", color)}>
            <Icon className="h-4.5 w-4.5" />
          </div>
        </div>
        {!isNeutral && (
          <div className="mt-3 flex items-center gap-1">
            {isPositive ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> : <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
            <span className={cn("text-[11px] font-semibold", isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
              {isPositive ? "+" : ""}{change}%
            </span>
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500">vs yesterday</span>
          </div>
        )}
      </Card>
    </motion.div>
  );
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

interface FilterState {
  status: string;
  user: string;
  action: string;
  country: string;
  browser: string;
  os: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: FilterState = { status: "", user: "", action: "", country: "", browser: "", os: "", dateFrom: "", dateTo: "" };

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full appearance-none rounded-lg border border-zinc-200 bg-white px-3 pr-8 text-sm text-zinc-800 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:focus:border-brand-500/60"
        >
          <option value="">All</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
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
  const headers = ["ID","Status","Action","User","IP","Country","Device","Browser","OS","Method","Endpoint","Response Code","Timestamp","Request ID"];
  const rows = logs.map((l) => [l.id,l.status,l.action,l.user,l.ip,l.country,l.device,l.browser,l.os,l.method,l.endpoint,l.responseCode,l.timestamp,l.requestId].join(","));
  downloadFile([headers.join(","), ...rows].join("\n"), `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv");
}

function exportJSON(logs: AuditLogEntry[]) {
  downloadFile(JSON.stringify(logs, null, 2), `audit-logs-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
}

function AuditLogsPage() {
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "timestamp", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [copied, setCopied] = useState(false);

  const activeFilterCount = useMemo(() => Object.values(filters).filter(Boolean).length, [filters]);

  const filteredData = useMemo(() => {
    return DUMMY_LOGS.filter((log) => {
      if (filters.status && log.status !== filters.status) return false;
      if (filters.user && log.user !== filters.user) return false;
      if (filters.action && log.action !== filters.action) return false;
      if (filters.country && log.country !== filters.country) return false;
      if (filters.browser && !log.browser.startsWith(filters.browser)) return false;
      if (filters.os && log.os !== filters.os) return false;
      if (filters.dateFrom && log.timestamp < filters.dateFrom) return false;
      if (filters.dateTo && log.timestamp > filters.dateTo + "T23:59:59") return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          log.action.toLowerCase().includes(q) ||
          log.user.toLowerCase().includes(q) ||
          log.ip.includes(q) ||
          log.country.toLowerCase().includes(q) ||
          log.id.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [filters, search]);

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
        <button className="flex items-center gap-1 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors" onClick={() => column.toggleSorting()}>
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
      cell: ({ row }) => <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{row.original.ip}</span>,
    },
    { accessorKey: "country", header: "Country", size: 110 },
    { accessorKey: "device", header: "Device", size: 90 },
    {
      accessorKey: "browser",
      header: "Browser",
      size: 110,
      cell: ({ row }) => <span className="text-xs">{row.original.browser}</span>,
    },
    {
      accessorKey: "os",
      header: "OS",
      size: 120,
      cell: ({ row }) => <span className="text-xs">{row.original.os}</span>,
    },
    {
      accessorKey: "timestamp",
      header: ({ column }) => (
        <button className="flex items-center gap-1 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors" onClick={() => column.toggleSorting()}>
          Timestamp <ArrowUpDown className="h-3 w-3" />
        </button>
      ),
      size: 170,
      cell: ({ row }) => (
        <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
          {new Date(row.original.timestamp).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      ),
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
            className="rounded-md p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 transition-colors"
            title="Copy log"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedLog(row.original);
            }}
            className="rounded-md p-1.5 text-zinc-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/30 dark:hover:text-brand-400 transition-colors"
            title="View detail"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ], []);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, columnFilters, globalFilter: search },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });

  const handleClearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setSearch("");
  }, []);

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-[1400px] space-y-6 p-4 sm:p-6">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100">Audit Logs</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Monitor and review all system activity and security events.</p>
        </motion.div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {STAT_CARDS.map((card, i) => (
            <StatCard key={card.label} {...card} index={i} />
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.15 }} className="lg:col-span-2">
            <Card className="p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Activity Trend</h3>
              <div className="h-[220px] sm:h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={TREND_DATA} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} className="fill-zinc-500 dark:fill-zinc-400" />
                    <YAxis tick={{ fontSize: 11 }} className="fill-zinc-500 dark:fill-zinc-400" />
                    <RechartsTooltip contentStyle={{ borderRadius: 12, border: "1px solid #e4e4e7", fontSize: 12, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }} />
                    <Line type="monotone" dataKey="events" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.2 }}>
            <Card className="p-4 sm:p-5 h-full">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Event Severity</h3>
              <div className="h-[220px] sm:h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={SEVERITY_DATA} cx="50%" cy="45%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value" stroke="none">
                      {SEVERITY_DATA.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Legend verticalAlign="bottom" iconType="circle" iconSize={8} formatter={(value: string) => <span className="text-xs text-zinc-600 dark:text-zinc-400">{value}</span>} />
                    <RechartsTooltip contentStyle={{ borderRadius: 12, border: "1px solid #e4e4e7", fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.25 }}>
          <Card className="p-3 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-1 items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <Input placeholder="Search logs..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 pl-9 text-sm" />
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)} className={cn("h-9 gap-1.5", showFilters && "border-brand-500 text-brand-600 dark:text-brand-400")}>
                  <Filter className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Filters</span>
                  {activeFilterCount > 0 && (
                    <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">{activeFilterCount}</span>
                  )}
                </Button>
                {activeFilterCount > 0 && (
                  <button onClick={handleClearFilters} className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors flex items-center gap-1">
                    <X className="h-3 w-3" /> Clear
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs" onClick={() => exportCSV(filteredData)}>
                  <Download className="h-3.5 w-3.5" /> CSV
                </Button>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs" onClick={() => exportJSON(filteredData)}>
                  <Download className="h-3.5 w-3.5" /> JSON
                </Button>
              </div>
            </div>

            <AnimatePresence>
              {showFilters && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }} className="overflow-hidden">
                  <div className="mt-3 grid grid-cols-2 gap-3 border-t border-zinc-100 pt-3 dark:border-zinc-800 sm:grid-cols-3 lg:grid-cols-7">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Date From</label>
                      <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Date To</label>
                      <input type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200" />
                    </div>
                    <FilterSelect label="Status" value={filters.status} onChange={(v) => setFilters((f) => ({ ...f, status: v }))} options={["success","warning","error","info"]} />
                    <FilterSelect label="User" value={filters.user} onChange={(v) => setFilters((f) => ({ ...f, user: v }))} options={USERS} />
                    <FilterSelect label="Action" value={filters.action} onChange={(v) => setFilters((f) => ({ ...f, action: v }))} options={ACTIONS} />
                    <FilterSelect label="Country" value={filters.country} onChange={(v) => setFilters((f) => ({ ...f, country: v }))} options={COUNTRIES} />
                    <FilterSelect label="Browser" value={filters.browser} onChange={(v) => setFilters((f) => ({ ...f, browser: v }))} options={BROWSERS.map((b) => b.split(" ")[0]!)} />
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
                  <TableRow key={hg.id} className="bg-zinc-50/80 dark:bg-zinc-900/60">
                    {hg.headers.map((header) => (
                      <TableHead key={header.id} style={{ width: header.getSize() }}>
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-32 text-center text-sm text-zinc-400">
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

            <div className="flex flex-col items-center justify-between gap-3 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:flex-row">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Showing{" "}
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">{table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}</span>
                {" - "}
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">{Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, filteredData.length)}</span>
                {" of "}
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">{filteredData.length}</span> logs
              </p>
              <div className="flex items-center gap-1.5">
                <select value={table.getState().pagination.pageSize} onChange={(e) => table.setPageSize(Number(e.target.value))} className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                  {[10, 20, 50].map((size) => <option key={size} value={size}>{size} / page</option>)}
                </select>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="px-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">{table.getState().pagination.pageIndex + 1} / {table.getPageCount()}</span>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}>
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
              className="fixed bottom-6 right-6 z-50 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
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
                <div className="grid gap-3 text-sm">
                  {([
                    ["Request ID", selectedLog.requestId, true],
                    ["User", selectedLog.user, false],
                    ["Role", selectedLog.role, false],
                    ["Action", selectedLog.action, true],
                    ["IP Address", selectedLog.ip, true],
                    ["Country", selectedLog.country, false],
                    ["Browser", selectedLog.browser, false],
                    ["Operating System", selectedLog.os, false],
                    ["Device", selectedLog.device, false],
                    ["Request Method", selectedLog.method, true],
                    ["Endpoint", selectedLog.endpoint, true],
                    ["Response Code", String(selectedLog.responseCode), true],
                    ["Status", selectedLog.status, false],
                    ["Timestamp", new Date(selectedLog.timestamp).toLocaleString("id-ID", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }), false],
                  ] as [string, string, boolean][]).map(([label, value, mono]) => (
                    <div key={label} className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-2.5 last:border-0 dark:border-zinc-800">
                      <span className="text-zinc-500 dark:text-zinc-400 shrink-0">{label}</span>
                      <span className={cn("text-right text-zinc-900 dark:text-zinc-100 break-all", mono && "font-mono text-xs")}>{value}</span>
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
