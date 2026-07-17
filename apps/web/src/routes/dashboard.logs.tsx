import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  Download,
  Upload,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RefreshCw,
  Filter,
  Clock,
  HardDrive,
  Globe,
  FileText,
} from "lucide-react";
import { Badge, Skeleton } from "@nqdrive/ui";
import { formatBytes } from "@nqdrive/shared";
import { useUploadLogs, useDownloadLogs } from "../hooks/use-logs-and-api-keys";
import { formatLocal } from "../lib/datetime";
import { cn } from "@nqdrive/ui";
import { PageTransition } from "../components/page-transition";
import { PageHeader } from "../components/ui-kit";
import { TableVirtuoso } from "react-virtuoso";
import { LogsSkeletonRows } from "../components/skeletons";
import { AnimatePresence } from "framer-motion";
import { useMinLoading } from "../hooks/use-min-loading";

export const Route = createFileRoute("/dashboard/logs")({
  component: LogsPage,
});

const STATUS_VARIANT: Record<string, "success" | "destructive" | "warning" | "neutral"> = {
  success: "success",
  completed: "success",
  failed: "destructive",
  cancelled: "neutral",
  partial: "warning",
};

const STATUS_LABELS: Record<string, string> = {
  success: "Sukses",
  completed: "Selesai",
  failed: "Gagal",
  cancelled: "Dibatalkan",
  partial: "Sebagian",
};

const PAGE_SIZES = [12, 21, 30, 50];

function getResponsivePageSize(): number {
  if (typeof window === "undefined") return 21;
  if (window.innerWidth < 640) return 12;
  if (window.innerWidth >= 1024) return 21;
  return 15;
}

// ─── Upload Row Type ─────────────────────────────────────────────────────────
interface UploadLog {
  id: number;
  filename: string;
  size_bytes: number;
  duration_ms: number;
  status: string;
  created_at: string;
}

// ─── Download Row Type ───────────────────────────────────────────────────────
interface DownloadLog {
  id: number;
  filename: string | null;
  ip_address: string;
  country: string | null;
  bytes_served: number;
  status: string;
  created_at: string;
}

// ─── Reusable Toolbar ────────────────────────────────────────────────────────
function TableToolbar({
  search,
  onSearch,
  statusFilter,
  onStatusFilter,
  statuses,
  total,
  isLoading,
  onRefresh,
}: {
  search: string;
  onSearch: (v: string) => void;
  statusFilter: string;
  onStatusFilter: (v: string) => void;
  statuses: string[];
  total: number;
  isLoading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3 border-b border-[rgb(var(--border-subtle))] sm:flex-row sm:items-center sm:justify-between">
      {/* Search */}
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[rgb(var(--ink-500))]" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Cari nama file..."
          className="h-9 w-full rounded-lg border border-[rgb(var(--border-subtle))] dark:border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface-muted))] dark:bg-[rgb(var(--surface-muted))]/50 pl-9 pr-3 text-sm text-[rgb(var(--foreground))] placeholder-[rgb(var(--ink-500))] outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2">
        {/* Status filter */}
        <div className="relative">
          <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[rgb(var(--ink-500))] pointer-events-none" />
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilter(e.target.value)}
            className="h-9 appearance-none rounded-lg border border-[rgb(var(--border-subtle))] dark:border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface-muted))] dark:bg-[rgb(var(--surface-muted))]/50 pl-8 pr-7 text-sm text-[rgb(var(--ink-500))] dark:text-[rgb(var(--foreground))] outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="">Semua Status</option>
            {statuses.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
            ))}
          </select>
        </div>

        {/* Refresh */}
        <button
          type="button"
          aria-label="Segarkan data"
          onClick={onRefresh}
          disabled={isLoading}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface-muted))]/50 text-[rgb(var(--ink-500))] hover:text-[rgb(var(--foreground))] transition disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          title="Refresh"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} aria-hidden="true" />
        </button>

        {/* Total count */}
        <span className="hidden sm:inline text-xs text-[rgb(var(--ink-500))] dark:text-[rgb(var(--ink-500))] whitespace-nowrap">
          {total} baris
        </span>
      </div>
    </div>
  );
}

// ─── Pagination ──────────────────────────────────────────────────────────────
function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize: (s: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-3 px-4 py-3 border-t border-[rgb(var(--border-subtle))] sm:flex-row sm:items-center sm:justify-between">
      {/* Page size */}
      <div className="flex items-center gap-2 text-sm text-[rgb(var(--ink-500))]">
        <span>Tampilkan</span>
        <select
          value={pageSize}
          onChange={(e) => { onPageSize(Number(e.target.value)); onPage(1); }}
          className="h-8 rounded-md border border-[rgb(var(--border-subtle))] dark:border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface-muted))] dark:bg-[rgb(var(--surface-muted))] px-2 text-sm outline-none focus:border-brand-500"
        >
          {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span>per halaman</span>
      </div>

      {/* Info + nav */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-[rgb(var(--ink-500))]">
          {from}–{to} dari {total}
        </span>
        <div className="flex items-center gap-1">
          <PagBtn onClick={() => onPage(1)} disabled={page === 1} title="Halaman pertama">
            <ChevronsLeft className="h-3.5 w-3.5" />
          </PagBtn>
          <PagBtn onClick={() => onPage(page - 1)} disabled={page === 1} title="Sebelumnya">
            <ChevronLeft className="h-3.5 w-3.5" />
          </PagBtn>
          <span className="text-xs font-medium text-[rgb(var(--ink-500))] dark:text-[rgb(var(--foreground))] px-2">
            {page} / {pageCount}
          </span>
          <PagBtn onClick={() => onPage(page + 1)} disabled={page >= pageCount} title="Berikutnya">
            <ChevronRight className="h-3.5 w-3.5" />
          </PagBtn>
          <PagBtn onClick={() => onPage(pageCount)} disabled={page >= pageCount} title="Halaman terakhir">
            <ChevronsRight className="h-3.5 w-3.5" />
          </PagBtn>
        </div>
      </div>
    </div>
  );
}

function PagBtn({ children, onClick, disabled, title }: { children: React.ReactNode; onClick: () => void; disabled: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] text-[rgb(var(--ink-500))] hover:bg-[rgb(var(--surface-muted))] hover:text-[rgb(var(--foreground))] transition disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      {children}
    </button>
  );
}

// ── Skeleton Rows — now from centralized skeletons.tsx ───────────────────────
// LogsSkeletonRows is imported from components/skeletons.tsx

// ─── Empty State ─────────────────────────────────────────────────────────────
function EmptyState({ message }: { message: string }) {
  return (
    <tr>
      <td colSpan={10} className="py-20 text-center">
        <div className="flex flex-col items-center gap-2 text-[rgb(var(--ink-500))]">
          <FileText className="h-8 w-8 opacity-40" />
          <p className="text-sm">{message}</p>
        </div>
      </td>
    </tr>
  );
}

// ─── Upload Table ─────────────────────────────────────────────────────────────
function UploadTable() {
  const { data, isLoading: isQueryLoading, isFetching, refetch } = useUploadLogs();
  // Tampilkan skeleton saat initial load ATAU saat manual refresh
  const isLoading = useMinLoading(isQueryLoading || isFetching, 600);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => getResponsivePageSize());

  const logs: UploadLog[] = (data?.logs as UploadLog[] | undefined) ?? [];

  const statuses = useMemo(() => [...new Set(logs.map((l) => l.status))], [logs]);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      const matchSearch = !search || l.filename.toLowerCase().includes(search.toLowerCase());
      const matchStatus = !statusFilter || l.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [logs, search, statusFilter]);

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const thClass = "h-11 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-[rgb(var(--ink-500))] whitespace-nowrap";
  const tdClass = "px-4 py-3 text-sm";

  return (
    <div className="flex flex-col flex-1">
      <TableToolbar
        search={search} onSearch={(v) => { setSearch(v); setPage(1); }}
        statusFilter={statusFilter} onStatusFilter={(v) => { setStatusFilter(v); setPage(1); }}
        statuses={statuses}
        total={filtered.length}
        isLoading={isLoading}
        onRefresh={() => refetch()}
      />
      <div className="flex-1 overflow-x-auto" style={{ minHeight: 0 }}>
        {isLoading ? (
          <table className="w-full">
            <LogsSkeletonRows cols={5} rows={6} />
          </table>
        ) : paged.length === 0 ? (
          <table className="w-full">
            <tbody><EmptyState message={search || statusFilter ? "Tidak ada log yang sesuai filter." : "Belum ada riwayat upload."} /></tbody>
          </table>
        ) : (
          <TableVirtuoso
            style={{ height: "calc(100vh - 22rem)" }}
            data={paged}
            fixedHeaderContent={() => (
              <tr className="border-b border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface-muted))]/80 dark:bg-[rgb(var(--surface))]/60">
                <th className={thClass}><div className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Nama File</div></th>
                <th className={thClass}><div className="flex items-center gap-1.5"><HardDrive className="h-3.5 w-3.5" /> Ukuran</div></th>
                <th className={thClass}><div className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Durasi</div></th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Waktu</th>
              </tr>
            )}
            itemContent={(_, log) => (
              <>
                <td className={cn(thClass, "font-medium text-[rgb(var(--foreground))] max-w-[200px] sm:max-w-[320px] normal-case tracking-normal")}>
                  <span className="truncate block" title={log.filename}>{log.filename}</span>
                </td>
                <td className={cn(tdClass, "text-[rgb(var(--ink-500))] whitespace-nowrap")}>{formatBytes(log.size_bytes)}</td>
                <td className={cn(tdClass, "text-[rgb(var(--ink-500))] whitespace-nowrap")}>{(log.duration_ms / 1000).toFixed(1)}s</td>
                <td className={tdClass}><Badge variant={STATUS_VARIANT[log.status] ?? "neutral"}>{STATUS_LABELS[log.status] ?? log.status}</Badge></td>
                <td className={cn(tdClass, "text-[rgb(var(--ink-500))] dark:text-[rgb(var(--ink-500))] whitespace-nowrap")}>{formatLocal(log.created_at)}</td>
              </>
            )}
            components={{
              Table: ({ style, ...props }) => <table {...props} style={style} className="w-full caption-bottom text-sm" />,
              TableRow: ({ style, ...props }) => <tr {...props} style={style} className="group transition-colors hover:bg-[rgb(var(--surface-muted))] dark:hover:bg-[rgb(var(--surface-muted))]/40 divide-x-0 border-b border-[rgb(var(--border-subtle))] dark:border-[rgb(var(--border-subtle))]/60" />,
            }}
          />
        )}
      </div>
      <Pagination page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={setPageSize} />
    </div>
  );
}

// ─── Download Table ───────────────────────────────────────────────────────────
function DownloadTable() {
  const { data, isLoading: isQueryLoading, isFetching, refetch } = useDownloadLogs();
  // Tampilkan skeleton saat initial load ATAU saat manual refresh
  const isLoading = useMinLoading(isQueryLoading || isFetching, 600);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => getResponsivePageSize());

  const logs: DownloadLog[] = (data?.logs as DownloadLog[] | undefined) ?? [];

  const statuses = useMemo(() => [...new Set(logs.map((l) => l.status))], [logs]);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      const matchSearch = !search || (l.filename ?? "").toLowerCase().includes(search.toLowerCase()) || l.ip_address.includes(search);
      const matchStatus = !statusFilter || l.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [logs, search, statusFilter]);

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const thClass = "h-11 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-[rgb(var(--ink-500))] whitespace-nowrap";
  const tdClass = "px-4 py-3 text-sm";

  return (
    <div className="flex flex-col flex-1">
      <TableToolbar
        search={search} onSearch={(v) => { setSearch(v); setPage(1); }}
        statusFilter={statusFilter} onStatusFilter={(v) => { setStatusFilter(v); setPage(1); }}
        statuses={statuses}
        total={filtered.length}
        isLoading={isLoading}
        onRefresh={() => refetch()}
      />
      <div className="flex-1 overflow-x-auto" style={{ minHeight: 0 }}>
        {isLoading ? (
          <table className="w-full">
            <LogsSkeletonRows cols={5} rows={6} />
          </table>
        ) : paged.length === 0 ? (
          <table className="w-full">
            <tbody><EmptyState message={search || statusFilter ? "Tidak ada log yang sesuai filter." : "Belum ada riwayat download."} /></tbody>
          </table>
        ) : (
          <TableVirtuoso
            style={{ height: "calc(100vh - 22rem)" }}
            data={paged}
            fixedHeaderContent={() => (
              <tr className="border-b border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface-muted))]/80 dark:bg-[rgb(var(--surface))]/60">
                <th className={thClass}><div className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Nama File</div></th>
                <th className={thClass}><div className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" /> IP Address</div></th>
                <th className={thClass}><div className="flex items-center gap-1.5"><HardDrive className="h-3.5 w-3.5" /> Dikirim</div></th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Waktu</th>
              </tr>
            )}
            itemContent={(_, log) => (
              <>
                <td className={cn(thClass, "font-medium text-[rgb(var(--foreground))] max-w-[160px] sm:max-w-[280px] normal-case tracking-normal")}>
                  <span className="truncate block" title={log.filename ?? ""}>
                    {log.filename ?? <span className="italic text-[rgb(var(--ink-500))]">(file dihapus)</span>}
                  </span>
                </td>
                <td className={cn(tdClass, "text-[rgb(var(--ink-500))]")}>
                  <div className="flex items-center gap-2">
                    {log.country && !["unknown", "xx", "t1"].includes(log.country.toLowerCase()) ? (
                      <img src={`https://flagcdn.com/20x15/${log.country.toLowerCase()}.png`} alt={log.country} title={`Negara: ${log.country.toUpperCase()}`} className="rounded-sm shadow-sm shrink-0" width={20} height={15} />
                    ) : (
                      <span className="inline-block w-5 h-4 rounded-sm bg-[rgb(var(--surface-muted))] dark:bg-[rgb(var(--surface-muted))] shrink-0" title="Negara tidak diketahui" />
                    )}
                    <span className="font-mono text-xs">{log.ip_address}</span>
                  </div>
                </td>
                <td className={cn(tdClass, "text-[rgb(var(--ink-500))] whitespace-nowrap")}>{formatBytes(log.bytes_served)}</td>
                <td className={tdClass}><Badge variant={STATUS_VARIANT[log.status] ?? "neutral"}>{STATUS_LABELS[log.status] ?? log.status}</Badge></td>
                <td className={cn(tdClass, "text-[rgb(var(--ink-500))] dark:text-[rgb(var(--ink-500))] whitespace-nowrap")}>{formatLocal(log.created_at)}</td>
              </>
            )}
            components={{
              Table: ({ style, ...props }) => <table {...props} style={style} className="w-full caption-bottom text-sm" />,
              TableRow: ({ style, ...props }) => <tr {...props} style={style} className="group transition-colors hover:bg-[rgb(var(--surface-muted))] dark:hover:bg-[rgb(var(--surface-muted))]/40 border-b border-[rgb(var(--border-subtle))] dark:border-[rgb(var(--border-subtle))]/60" />,
            }}
          />
        )}
      </div>
      <Pagination page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={setPageSize} />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function LogsPage() {
  const [tab, setTab] = useState<"uploads" | "downloads">("uploads");

  return (
    <PageTransition>
    <div className="flex flex-col gap-6">
      {/* Header */}
      <PageHeader
        eyebrow="System"
        icon={FileText}
        title="Logs"
        description="Riwayat aktivitas upload dan download real-time."
      />

      {/* Tab selector */}
      <div className="flex items-center gap-1 rounded-xl border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface-muted))] dark:bg-[rgb(var(--surface))] p-1 w-fit">
        {([
          { value: "uploads", label: "Upload", icon: Upload },
          { value: "downloads", label: "Download", icon: Download },
        ] as const).map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
              tab === value
                ? "bg-brand-500 text-white shadow-sm shadow-brand-500/25"
                : "text-[rgb(var(--ink-500))] hover:text-[rgb(var(--ink-500))] dark:hover:text-[rgb(var(--foreground))]"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Table card — fills remaining screen height */}
      <div className="flex-1 rounded-lg border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] overflow-hidden shadow-sm flex flex-col min-h-[calc(100vh-16rem)]">
        <AnimatePresence mode="wait">
          {tab === "uploads" ? <UploadTable key="uploads" /> : <DownloadTable key="downloads" />}
        </AnimatePresence>
      </div>
    </div>
  </PageTransition>
  );
}
