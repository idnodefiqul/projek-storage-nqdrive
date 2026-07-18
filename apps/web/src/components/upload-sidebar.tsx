import { useEffect, useRef, useId, useCallback } from "react";
import { X, CheckCircle2, Loader2, XCircle, Trash2, FileCheck, Pause, Play, ArrowLeftRight } from "lucide-react";

const FOCUSABLE_SEL = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SEL)).filter((el) => {
    if (el.hasAttribute("disabled")) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    const cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    return el.getClientRects().length > 0 || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
  });
}
import { IconCloudUpload } from "@tabler/icons-react";
import { Button, Progress } from "@nqdrive/ui";
import { formatBytes } from "@nqdrive/shared";
import { useUploadGlobal } from "../stores/upload-provider";
import { useMigrationGlobal, maskEmail } from "../stores/migration-provider";
import { motion, AnimatePresence } from "framer-motion";

function getTaskId(j: { taskId?: string | null } | null | undefined): string {
  return j?.taskId ?? "";
}
function getFileIdFromItem(it: { fileId?: string | null } | null | undefined): string {
  return it?.fileId ?? "";
}

const PANEL_TRANSITION = {
  type: "tween" as const,
  ease: [0.32, 0.72, 0, 1],
  duration: 0.45,
};

const BACKDROP_TRANSITION = {
  type: "tween" as const,
  ease: [0.4, 0, 0.2, 1],
  duration: 0.35,
};

const CONTENT_TRANSITION = {
  type: "tween" as const,
  ease: [0.32, 0.72, 0, 1],
  duration: 0.35,
  delay: 0.08,
};

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond <= 0) return "0 B/s";
  const k = 1024;
  const sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
  const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
  return `${parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function UploadSidebar() {
  const {
    items,
    recentItems,
    isUploadSidebarOpen,
    setUploadSidebarOpen,
    startUpload,
    pauseUpload,
    removeItem,
    clearRecent,
  } = useUploadGlobal();

  const { activeJobs: migrationJobs, recentJobs: recentMigrations, cancelMigration } = useMigrationGlobal();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const prevActiveRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const html = document.documentElement;
    if (isUploadSidebarOpen) {
      prevActiveRef.current = document.activeElement as HTMLElement | null;
      html.style.overflow = "hidden";
      requestAnimationFrame(() => {
        const c = panelRef.current;
        if (!c) return;
        const f = getFocusable(c);
        f[0]?.focus();
      });
    } else {
      html.style.overflow = "";
      const prev = prevActiveRef.current;
      if (prev) setTimeout(() => { try { prev.focus(); } catch {} }, 0);
    }
    return () => { html.style.overflow = ""; };
  }, [isUploadSidebarOpen]);

  useEffect(() => {
    if (!isUploadSidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const container = panelRef.current;
      if (!container) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setUploadSidebarOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = getFocusable(container);
      if (focusable.length === 0) { e.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !container.contains(active)) { e.preventDefault(); last!.focus(); }
      } else {
        if (active === last) { e.preventDefault(); first!.focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [isUploadSidebarOpen, setUploadSidebarOpen]);

  const handleClose = useCallback(() => setUploadSidebarOpen(false), [setUploadSidebarOpen]);

  const handleCancelMigration = (jobId: string, sourceEmail: string, targetEmail: string) => {
    if (!confirm(`Batalkan migrasi ${maskEmail(sourceEmail)} → ${maskEmail(targetEmail)}?\n\nFile yang sudah terlanjur dipindahkan tetap berada di akun tujuan.`)) return;
    void cancelMigration(jobId);
  };

  // All items in items state represent the active queue (uploading, queued, paused, error)
  const activeItems = items;

  return (
    <AnimatePresence mode="wait">
      {isUploadSidebarOpen && (
        <>
          {/* Backdrop — z-[70] to cover dashboard + mobile sidebars */}
          <motion.div
            key="upload-backdrop"
            className="fixed inset-0 z-[70] bg-black/30 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={BACKDROP_TRANSITION}
            onClick={handleClose}
          />

          {/* Sidebar panel from right — z-[71] */}
          <motion.div
            key="upload-panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="fixed right-0 top-0 bottom-0 z-[71] flex w-72 flex-col overflow-hidden rounded-l-3xl text-white sm:w-80 focus:outline-none"
            style={{ backgroundColor: "var(--brand-a)", backgroundImage: "var(--brand-fill)", willChange: "transform, opacity", boxShadow: "0 0 30px -8px rgba(0,0,0,0.25)" }}
            initial={{ x: "100%", opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={PANEL_TRANSITION}
          >
            {/* Header */}
            <motion.div
              className="flex shrink-0 items-center justify-between p-4"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={CONTENT_TRANSITION}
            >
              <div className="flex items-center gap-2">
                <IconCloudUpload className="h-5 w-5 text-white" />
                <h2 id={titleId} className="text-base font-bold text-white">Progress</h2>
              </div>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Tutup panel progress"
                className="rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </motion.div>

            {/* Content area */}
            <div className="mx-3 mb-3 min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-hide rounded-2xl bg-[rgb(var(--surface))] p-4 text-[rgb(var(--foreground))]">
              {/* Active Uploads section */}
              <motion.div
                className="space-y-4"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ ...CONTENT_TRANSITION, delay: 0.12 }}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    Aktif ({activeItems.length})
                  </h3>
                  {activeItems.some((i) => i.status === "uploading") && (
                    <span className="text-[10px] bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 px-2 py-0.5 rounded-full font-medium">
                      Uploading
                    </span>
                  )}
                </div>

                {activeItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/30">
                    <FileCheck className="h-8 w-8 text-zinc-300 dark:text-zinc-700" />
                    <p className="text-xs text-zinc-400 mt-2">Tidak ada upload aktif</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activeItems.map((item) => {
                      const isUploading = item.status === "uploading";
                      const isPaused = item.status === "paused";
                      const isError = item.status === "error";
                      const percent = item.progress.percentage;

                      return (
                        <div
                          key={item.id}
                          className="p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/10 space-y-2 relative"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate" title={item.file.name}>
                                {item.file.name}
                              </p>
                              <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 mt-0.5">
                                <span>{formatBytes(item.progress.uploadedBytes)} / {formatBytes(item.progress.totalBytes)}</span>
                                {isUploading && (
                                  <>
                                    <span>•</span>
                                    <span>{formatSpeed(item.progress.speedBytesPerSecond)}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {/* Pause / Resume Controls */}
                              {isUploading ? (
                                <button
                                  onClick={() => pauseUpload(item.id)}
                                  className="text-zinc-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 rounded-lg p-1 transition-colors shrink-0"
                                  aria-label="Jeda upload" title="Jeda"
                                >
                                  <Pause className="h-3.5 w-3.5" />
                                </button>
                              ) : isPaused || isError ? (
                                <button
                                  onClick={() => startUpload(item.id)}
                                  className="text-zinc-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 rounded-lg p-1 transition-colors shrink-0"
                                  aria-label="Lanjutkan upload" title="Lanjutkan"
                                >
                                  <Play className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                              {/* Cancel / Remove Button */}
                              <button
                                onClick={() => removeItem(item.id)}
                                className="text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg p-1 transition-colors shrink-0"
                                title="Batal"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <Progress value={percent} className="h-1.5 bg-zinc-200 dark:bg-zinc-800" aria-label={`Progress ${item.file.name} ${percent.toFixed(0)} persen`} />
                            <div className="flex justify-between items-center text-[9px] text-zinc-400 font-mono">
                              <span>
                                {isUploading ? "Uploading..." : isPaused ? "Dijeda" : isError ? `Gagal: ${item.errorMessage}` : "Antrean"}
                              </span>
                              <span>{percent.toFixed(0)}%</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>

              {/* Active Migrations section */}
              <motion.div
                className="space-y-4"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ ...CONTENT_TRANSITION, delay: 0.15 }}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    Migrasi ({migrationJobs.length})
                  </h3>
                  {migrationJobs.length > 0 && (
                    <span className="text-[10px] bg-brand-50 dark:bg-brand-500/15 text-brand-600 dark:text-brand-300 px-2 py-0.5 rounded-full font-medium">
                      Berjalan
                    </span>
                  )}
                </div>

                {migrationJobs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/30">
                    <ArrowLeftRight className="h-7 w-7 text-zinc-300 dark:text-zinc-700" />
                    <p className="text-xs text-zinc-400 mt-2">Tidak ada migrasi aktif</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {migrationJobs.map((job) => {
                      const percent = job.totalFiles > 0 ? (job.migratedFiles / job.totalFiles) * 100 : 0;
                      return (
                        <div
                          key={getTaskId(job)}
                          className="p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/10 space-y-2 relative"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate flex items-center gap-1.5">
                                <ArrowLeftRight className="h-3 w-3 shrink-0 text-brand-500" />
                                <span className="truncate">
                                  {maskEmail(job.sourceEmail)} → {maskEmail(job.targetEmail)}
                                </span>
                              </p>
                              <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 mt-0.5">
                                <span>{job.migratedFiles}/{job.totalFiles} file</span>
                                <span>•</span>
                                <span>{formatBytes(job.migratedBytes)} / {formatBytes(job.totalBytes)}</span>
                              </div>
                            </div>
                            <button
                              onClick={() => handleCancelMigration(getTaskId(job), job.sourceEmail, job.targetEmail)}
                              className="text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg p-1 transition-colors shrink-0"
                              title="Batalkan migrasi"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <div className="space-y-1">
                            <Progress value={percent} className="h-1.5 bg-zinc-200 dark:bg-zinc-800" indicatorClassName="bg-brand-500" aria-label={`Progress migrasi ${percent.toFixed(0)} persen`} />
                            <div className="flex justify-between items-center text-[9px] text-zinc-400 font-mono">
                              <span>
                                Migrasi berjalan{job.failedFiles > 0 ? ` • ${job.failedFiles} gagal` : ""}
                              </span>
                              <span>{percent.toFixed(0)}%</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Recent migrations */}
                {recentMigrations.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      Recent Migrasi ({recentMigrations.length})
                    </h3>
                    {recentMigrations.map((job) => (
                      <div
                        key={getTaskId(job)}
                        className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">
                            {maskEmail(job.sourceEmail)} → {maskEmail(job.targetEmail)}
                          </p>
                          <p className="text-[10px] text-zinc-400 mt-0.5">
                            {job.migratedFiles}/{job.totalFiles} file • {formatBytes(job.migratedBytes)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {job.status === "completed" && <BadgeSuccess />}
                          {job.status === "cancelled" && (
                            <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500">Batal</span>
                          )}
                          {job.status === "failed" && <TooltipError message={job.error ?? "Migrasi gagal"} />}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>

              {/* Recent/Completed Uploads section */}
              <motion.div
                className="space-y-4"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ ...CONTENT_TRANSITION, delay: 0.18 }}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    Recent Upload ({recentItems.length})
                  </h3>
                  {recentItems.length > 0 && (
                    <button
                      onClick={clearRecent}
                      className="text-[10px] font-medium text-red-500 hover:underline flex items-center gap-1"
                    >
                      <Trash2 className="h-3 w-3" />
                      Clear History
                    </button>
                  )}
                </div>

                {recentItems.length === 0 ? (
                  <div className="text-center py-6 text-xs text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/30">
                    Belum ada riwayat upload
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recentItems.map((item) => {
                      const isSuccess = item.status === "success";
                      const isCancelled = item.status === "cancelled";
                      const isError = item.status === "error";

                       return (
                         <div
                           key={item.id}
                           className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                         >
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">
                                {item.name}
                              </p>
                              <p className="text-[10px] text-zinc-400 mt-0.5">
                                {formatBytes(item.size)}
                              </p>
                            </div>
                           <div className="flex items-center gap-2 shrink-0">
                             {isSuccess && (
                               <BadgeSuccess />
                             )}
                             {isCancelled && (
                               <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500">
                                 Batal
                               </span>
                             )}
                             {isError && (
                               <TooltipError message={item.errorMessage} />
                             )}
                             <button
                               onClick={() => removeItem(item.id)}
                               className="text-zinc-400 hover:text-red-500 rounded p-0.5 transition-colors"
                               title="Hapus"
                             >
                               <X className="h-3 w-3" />
                             </button>
                           </div>
                         </div>
                       );
                    })}
                  </div>
                )}
              </motion.div>
            </div>

            {/* Footer */}
            <motion.div
              className="p-4 border-t border-brand-500/15 dark:border-brand-500/20 flex gap-2"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ ...CONTENT_TRANSITION, delay: 0.22 }}
            >
              <Button
                variant="outline"
                onClick={handleClose}
                className="w-full border-zinc-300 dark:border-zinc-600 dark:text-zinc-100 dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700"
              >
                Tutup Panel
              </Button>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function BadgeSuccess() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="h-3 w-3" />
      Sukses
    </span>
  );
}

function TooltipError({ message }: { message?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-500"
      title={message || "Gagal upload"}
    >
      <XCircle className="h-3 w-3" />
      Gagal
    </span>
  );
}