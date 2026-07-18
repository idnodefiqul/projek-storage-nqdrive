import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import {
  FileText,
  FileArchive,
  FileCode,
  Image as ImageIcon,
  Monitor,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Upload,
  Download,
  Search,
  HardDrive,
  Globe,
  Clock,
} from "lucide-react";
import { motion } from "framer-motion";
import { Badge, cn } from "@nqdrive/ui";
import { formatBytes } from "@nqdrive/shared";
import { useUploadLogs, useDownloadLogs } from "../hooks/use-logs-and-api-keys";
import { formatLocal } from "../lib/datetime";
import { PageTransition } from "../components/page-transition";
import { useMinLoading } from "../hooks/use-min-loading";
import { getFileTypeInfo } from "../lib/file-icons";

export const Route = createFileRoute("/dashboard/logs")({
  component: LogsPage,
});

// ─── Bento base — sama seperti dashboard.index.tsx biar tidak terlalu rounded ──
// dashboard.index pakai rounded-[16px], bukan rounded-3xl (24px) seperti file referensi lama.
const bentoBase =
  "relative flex flex-col overflow-hidden rounded-[16px] border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] shadow-[var(--shadow-card)]";
const bentoBaseHover =
  "transition-all duration-300 hover:shadow-[var(--shadow-float)] hover:border-brand-200/60 dark:hover:border-brand-500/20";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};
const itemAnim = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const } },
};

type LogStatus = string;
interface UploadLog {
  logId: string;
  filename: string;
  size_bytes: number;
  duration_ms: number;
  status: string;
  created_at: string;
}
interface DownloadLog {
  logId: string;
  filename: string | null;
  ip_address: string;
  country: string | null;
  bytes_served: number;
  status: string;
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  success: "Sukses",
  completed: "Selesai",
  failed: "Gagal",
  cancelled: "Dibatalkan",
  partial: "Sebagian",
};
const STATUS_VARIANT: Record<string, "success" | "destructive" | "warning" | "neutral"> = {
  success: "success",
  completed: "success",
  failed: "destructive",
  cancelled: "neutral",
  partial: "warning",
};

function normalizeStatus(s: string): string {
  return STATUS_LABELS[s] ?? s;
}

function getUploadFileIcon(filename: string) {
  const ft = getFileTypeInfo(filename);
  return <ft.Icon className={cn("w-6 h-6", ft.color)} strokeWidth={1.6} />;
}

const ITEMS_PER_PAGE = 12;

// ─── Skeleton ────────────────────────────────────────────────────────────
function LogsBentoSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className={cn(bentoBase, "p-5 h-[160px] animate-pulse")}>
          <div className="flex justify-between items-start">
            <div className="h-6 w-6 rounded bg-[rgb(var(--surface-muted))]" />
            <div className="h-5 w-14 rounded-md bg-[rgb(var(--surface-muted))]" />
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-4 w-3/4 rounded bg-[rgb(var(--surface-muted))]" />
            <div className="h-3 w-1/2 rounded bg-[rgb(var(--surface-muted))]/70" />
          </div>
          <div className="mt-auto pt-3 border-t border-[rgb(var(--border-subtle))]/60">
            <div className="h-3 w-2/3 rounded bg-[rgb(var(--surface-muted))]/60" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Empty ───────────────────────────────────────────────────────────────
function EmptyBento({ tab, statusFilter, search }: { tab: "uploads" | "downloads"; statusFilter: string; search: string }) {
  const hasFilter = statusFilter !== "Semua Status" || !!search.trim();
  return (
    <div
      className={cn(
        bentoBase,
        "flex min-h-[380px] flex-col items-center justify-center gap-3 border-dashed p-8 text-center"
      )}
    >
      <span className="grid h-16 w-16 place-items-center rounded-[14px] bg-[rgb(var(--surface-muted))] text-[rgb(var(--ink-500))]/60 ring-1 ring-[rgb(var(--border-subtle))]">
        <Inbox className="h-8 w-8" />
      </span>
      <h3 className="text-[15px] font-bold text-[rgb(var(--foreground))]">
        {hasFilter ? "Tidak ada hasil" : `Belum ada log ${tab}`}
      </h3>
      <p className="max-w-sm text-[13px] leading-relaxed text-[rgb(var(--ink-500))]">
        {hasFilter
          ? "Coba ubah filter status atau kata kunci pencarian."
          : `Saat ini tidak ada aktivitas ${tab} yang terekam.`}
      </p>
    </div>
  );
}

// ─── Upload Card ─────────────────────────────────────────────────────────
function UploadBentoCard({ log }: { log: UploadLog }) {
  return (
    <div
      className={cn(
        bentoBase,
        bentoBaseHover,
        "p-5 h-[160px] flex flex-col gap-3 group"
      )}
    >
      {/* blob dekor */}
      <div className="pointer-events-none absolute top-0 right-0 w-24 h-24 bg-[rgb(var(--surface-muted))]/70 rounded-bl-full -mr-8 -mt-8 opacity-60 group-hover:scale-110 transition-transform" />
      <div className="flex justify-between items-start relative z-10">
        <div className="pt-0.5">{getUploadFileIcon(log.filename)}</div>
        <Badge variant={STATUS_VARIANT[log.status] ?? "neutral"} className="text-[11px]">
          {normalizeStatus(log.status)}
        </Badge>
      </div>
      <div className="relative z-10 min-w-0">
        <h3 className="truncate font-semibold text-[13px] leading-tight text-[rgb(var(--foreground))]" title={log.filename}>
          {log.filename}
        </h3>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-[rgb(var(--ink-500))]">
          <span>{formatBytes(log.size_bytes)}</span>
          <span className="h-0.5 w-0.5 rounded-full bg-[rgb(var(--ink-500))]/40" />
          <span>{(log.duration_ms / 1000).toFixed(1)}s</span>
        </div>
      </div>
      <div className="relative z-10 mt-auto flex items-center gap-1.5 border-t border-[rgb(var(--border-subtle))]/60 pt-3 text-[11px] text-[rgb(var(--ink-500))]">
        <Clock className="h-3 w-3 shrink-0 opacity-60" />
        <span className="truncate">{formatLocal(log.created_at)}</span>
      </div>
    </div>
  );
}

// ─── Download Card ───────────────────────────────────────────────────────
function DownloadBentoCard({ log }: { log: DownloadLog }) {
  const isUnknownCountry =
    !log.country || ["unknown", "xx", "t1"].includes(log.country.toLowerCase());
  return (
    <div className={cn(bentoBase, bentoBaseHover, "p-5 h-[160px] flex flex-col gap-3 group")}>
      <div className="pointer-events-none absolute top-0 right-0 w-24 h-24 bg-[rgb(var(--surface-muted))]/70 rounded-bl-full -mr-8 -mt-8 opacity-60 group-hover:scale-110 transition-transform" />
      <div className="flex justify-between items-start relative z-10">
        <div className="pt-0.5">
          {log.filename ? (
            getUploadFileIcon(log.filename)
          ) : (
            <FileText className="h-6 w-6 text-[rgb(var(--ink-500))]/50" />
          )}
        </div>
        <Badge variant={STATUS_VARIANT[log.status] ?? "neutral"} className="text-[11px]">
          {normalizeStatus(log.status)}
        </Badge>
      </div>
      <div className="relative z-10 min-w-0">
        <h3
          className="truncate font-semibold text-[13px] leading-tight text-[rgb(var(--foreground))]"
          title={log.filename ?? ""}
        >
          {log.filename ?? <span className="italic text-[rgb(var(--ink-500))]">(file dihapus)</span>}
        </h3>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-[rgb(var(--ink-500))]">
          <span className="inline-flex items-center gap-1.5">
            {!isUnknownCountry ? (
              <img
                src={`https://flagcdn.com/20x15/${log.country!.toLowerCase()}.png`}
                alt={log.country ?? ""}
                className="h-3 w-5 rounded-[2px] object-cover shadow-sm"
              />
            ) : (
              <Globe className="h-3 w-3 opacity-50" />
            )}
            <span className="font-mono">{log.ip_address}</span>
          </span>
          <span className="h-0.5 w-0.5 rounded-full bg-[rgb(var(--ink-500))]/40" />
          <span>{formatBytes(log.bytes_served)}</span>
        </div>
      </div>
      <div className="relative z-10 mt-auto flex items-center gap-1.5 border-t border-[rgb(var(--border-subtle))]/60 pt-3 text-[11px] text-[rgb(var(--ink-500))]">
        <Clock className="h-3 w-3 shrink-0 opacity-60" />
        <span className="truncate">{formatLocal(log.created_at)}</span>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────
function LogsPage() {
  const [tab, setTab] = useState<"uploads" | "downloads">("uploads");
  const [statusFilter, setStatusFilter] = useState("Semua Status");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const uploadQ = useUploadLogs();
  const downloadQ = useDownloadLogs();

  const isFetching = tab === "uploads" ? uploadQ.isFetching : downloadQ.isFetching;
  const isQueryLoading = tab === "uploads" ? uploadQ.isLoading : downloadQ.isLoading;
  const isLoading = useMinLoading(isQueryLoading || isFetching, 400);

  const uploadLogs = (uploadQ.data?.logs as UploadLog[] | undefined) ?? [];
  const downloadLogs = (downloadQ.data?.logs as DownloadLog[] | undefined) ?? [];

  const rawLogs = tab === "uploads" ? uploadLogs : downloadLogs;

  const statuses = useMemo(() => {
    const set = new Set(rawLogs.map((l: any) => l.status as string));
    return Array.from(set);
  }, [rawLogs]);

  useEffect(() => {
    setPage(1);
  }, [tab, statusFilter, search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rawLogs.filter((log: any) => {
      const name = (log.filename ?? "").toLowerCase();
      const ip = (log.ip_address ?? "").toLowerCase();
      const matchSearch = !q || name.includes(q) || ip.includes(q);
      const matchStatus = statusFilter === "Semua Status" || log.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [rawLogs, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const currentLogs = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  return (
    <PageTransition>
      <div className="flex w-full flex-col gap-5 pb-10">
        {/* Header Bento — rounded-[16px] seperti dashboard.index, bukan rounded-3xl */}
        <motion.div variants={container} initial="hidden" animate="show">
          <motion.div variants={itemAnim} className={cn(bentoBase, "p-6 md:p-8 flex flex-col gap-5")}>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h1 className="font-display text-[22px] font-bold tracking-[-0.01em] text-[rgb(var(--foreground))] md:text-[24px]">
                  System Logs
                </h1>
                <p className="mt-1 text-[13px] text-[rgb(var(--ink-500))]">
                  Riwayat aktivitas upload dan download real-time.
                </p>
              </div>

              {/* Controls: upload/download toggle + status + total + search */}
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex rounded-[12px] bg-[rgb(var(--surface-muted))]/70 p-1 ring-1 ring-[rgb(var(--border-subtle))]/60">
                  <button
                    onClick={() => setTab("uploads")}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-[8px] px-4 py-2 text-[13px] font-semibold transition-all",
                      tab === "uploads"
                        ? "bg-[rgb(var(--surface))] text-[rgb(var(--foreground))] shadow-[var(--shadow-card)] ring-1 ring-[rgb(var(--border-subtle))]"
                        : "text-[rgb(var(--ink-500))] hover:text-[rgb(var(--foreground))]"
                    )}
                  >
                    <Upload className="h-3.5 w-3.5" /> Upload
                  </button>
                  <button
                    onClick={() => setTab("downloads")}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-[8px] px-4 py-2 text-[13px] font-semibold transition-all",
                      tab === "downloads"
                        ? "bg-[rgb(var(--surface))] text-[rgb(var(--foreground))] shadow-[var(--shadow-card)] ring-1 ring-[rgb(var(--border-subtle))]"
                        : "text-[rgb(var(--ink-500))] hover:text-[rgb(var(--foreground))]"
                    )}
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </button>
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[rgb(var(--ink-500))]/60" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari file / IP..."
                    className="h-9 w-[180px] rounded-[10px] border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] pl-8 pr-3 text-[13px] text-[rgb(var(--foreground))] outline-none ring-0 transition focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/15"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-9 rounded-[10px] border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] px-3 text-[13px] font-medium text-[rgb(var(--foreground))] outline-none transition focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/15"
                >
                  <option value="Semua Status">Semua Status</option>
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {normalizeStatus(s)}
                    </option>
                  ))}
                </select>

                <div className="inline-flex h-9 items-center rounded-[10px] bg-brand-500/10 px-3.5 text-[13px] font-bold text-brand-600 ring-1 ring-brand-500/15 dark:text-brand-300">
                  Total Logs: {filtered.length}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* Content — grid bento */}
        <div className="flex min-h-[420px] flex-1 flex-col">
          {isLoading ? (
            <LogsBentoSkeleton />
          ) : filtered.length === 0 ? (
            <EmptyBento tab={tab} statusFilter={statusFilter} search={search} />
          ) : (
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              {currentLogs.map((log: any) => (
                <motion.div key={log.logId ?? log.id ?? Math.random()} variants={itemAnim}>
                  {tab === "uploads" ? (
                    <UploadBentoCard log={log as UploadLog} />
                  ) : (
                    <DownloadBentoCard log={log as DownloadLog} />
                  )}
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>

        {/* Pagination — bento rounded-[16px] juga, bukan 2xl */}
        <div className={cn(bentoBase, "p-4 flex items-center justify-between gap-3")}>
          <span className="hidden pl-2 text-[13px] font-medium text-[rgb(var(--ink-500))] sm:block">
            Halaman <span className="font-bold text-[rgb(var(--foreground))]">{page}</span> dari{" "}
            <span className="font-bold text-[rgb(var(--foreground))]">{totalPages}</span>
          </span>
          <span className="text-[13px] font-medium text-[rgb(var(--ink-500))] sm:hidden">
            {page} / {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="inline-flex h-8 items-center gap-1 rounded-[10px] border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] px-3 text-[13px] font-semibold text-[rgb(var(--foreground))] transition hover:bg-[rgb(var(--surface-muted))] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" /> Sebelumnya
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="inline-flex h-8 items-center gap-1 rounded-[10px] border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] px-3 text-[13px] font-semibold text-[rgb(var(--foreground))] transition hover:bg-[rgb(var(--surface-muted))] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Selanjutnya <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
