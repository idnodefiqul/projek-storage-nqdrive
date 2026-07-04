import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  Trash2, RotateCcw, AlertTriangle, Folder as FolderIcon,
  FileIcon, Clock, Package, ChevronDown, ChevronUp, Loader2,
  ShieldAlert, CheckCircle2, Timer,
} from "lucide-react";
import {
  Card, CardContent, Button, Badge, Dialog, DialogHeader,
  DialogTitle, DialogDescription, DialogFooter, useToast, cn,
} from "@nqdrive/ui";
import { formatBytes } from "@nqdrive/shared";
import {
  useTrashItems,
  useRestoreFile,
  useRestoreFolder,
  usePermanentDeleteFile,
  usePermanentDeleteFolder,
  useEmptyTrash,
} from "../hooks/use-trash";
import type { FileWithAccount, Folder } from "@nqdrive/types";
import { PageTransition } from "../components/page-transition";
import { useMinLoading } from "../hooks/use-min-loading";

export const Route = createFileRoute("/dashboard/trash")({
  component: TrashPage,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDaysInTrash(deletedAt: string): number {
  const deleted = new Date(deletedAt).getTime();
  const now = Date.now();
  return Math.floor((now - deleted) / (1000 * 60 * 60 * 24));
}

function getDaysRemaining(deletedAt: string): number {
  return Math.max(0, 30 - getDaysInTrash(deletedAt));
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const days = getDaysInTrash(dateStr);
  if (days === 0) return "Hari ini";
  if (days === 1) return "Kemarin";
  return `${days} hari lalu`;
}

function DaysRemainingBadge({ deletedAt }: { deletedAt: string }) {
  const days = getDaysRemaining(deletedAt);
  const daysInTrash = getDaysInTrash(deletedAt);

  let colorClass = "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800";
  if (days <= 3) {
    colorClass = "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800";
  } else if (days <= 7) {
    colorClass = "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        colorClass
      )}
    >
      <Timer className="h-3 w-3" />
      {days === 0 ? "Kadaluarsa hari ini" : `${days} hari tersisa`}
    </span>
  );
}

// ─── Confirm Delete Dialog ─────────────────────────────────────────────────────

function ConfirmPermanentDeleteDialog({
  open,
  onClose,
  onConfirm,
  itemName,
  itemType,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemName: string;
  itemType: "file" | "folder";
  isPending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogHeader>
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <ShieldAlert className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <DialogTitle>Hapus Permanen?</DialogTitle>
        </div>
        <DialogDescription className="pl-[52px]">
          <strong className="text-zinc-900 dark:text-zinc-100">"{itemName}"</strong> akan dihapus permanen
          dari penyimpanan Google Drive dan tidak dapat dikembalikan sama sekali.
          {itemType === "folder" && (
            <span className="mt-1 block text-amber-600 dark:text-amber-400">
              ⚠ Semua file di dalam folder ini juga akan dihapus permanen.
            </span>
          )}
        </DialogDescription>
      </DialogHeader>
      <div className="mx-4 mb-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-3">
        <p className="text-xs text-red-700 dark:text-red-400 font-medium">
          Tindakan ini tidak bisa dibatalkan. File akan hilang selamanya dari Google Drive.
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" className="border-zinc-300 dark:border-zinc-600 dark:text-zinc-100 dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 shrink-0" onClick={onClose} disabled={isPending}>
          Batal
        </Button>
        <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
          {isPending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Menghapus...</>
          ) : (
            <><Trash2 className="mr-2 h-4 w-4" />Hapus Permanen</>
          )}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// ─── Empty Trash Confirm Dialog ────────────────────────────────────────────────

function ConfirmEmptyTrashDialog({
  open,
  onClose,
  onConfirm,
  totalItems,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  totalItems: number;
  isPending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogHeader>
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <DialogTitle>Kosongkan Trash?</DialogTitle>
        </div>
        <DialogDescription className="pl-[52px]">
          Semua <strong>{totalItems} item</strong> di Trash akan dihapus permanen dari Google Drive
          dan tidak dapat dikembalikan.
        </DialogDescription>
      </DialogHeader>
      <div className="mx-4 mb-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-3">
        <p className="text-xs text-red-700 dark:text-red-400 font-medium">
          Semua file dan folder di Trash akan hilang selamanya. Tindakan ini tidak bisa dibatalkan.
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" className="border-zinc-300 dark:border-zinc-600 dark:text-zinc-100 dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 shrink-0" onClick={onClose} disabled={isPending}>
          Batal
        </Button>
        <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
          {isPending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Mengosongkan...</>
          ) : (
            <><Trash2 className="mr-2 h-4 w-4" />Kosongkan Trash</>
          )}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// ─── Trash Item Row ────────────────────────────────────────────────────────────

function TrashItemRow({
  type,
  item,
  onRestore,
  onPermanentDelete,
}: {
  type: "file" | "folder";
  item: FileWithAccount | Folder;
  onRestore: () => void;
  onPermanentDelete: () => void;
}) {
  const isFile = type === "file";
  const file = isFile ? (item as FileWithAccount) : null;
  const folder = !isFile ? (item as Folder) : null;
  const name = file?.filename ?? folder?.name ?? "";
  const deletedAt = item.deletedAt ?? "";
  const daysRemaining = getDaysRemaining(deletedAt);
  const isExpiringSoon = daysRemaining <= 7;

  return (
    <tr
      className={cn(
        "group transition-colors animate-in fade-in duration-200",
        isExpiringSoon
          ? "hover:bg-red-50/50 dark:hover:bg-red-950/20"
          : "hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
      )}
    >
      {/* Nama */}
      <td className="px-4 py-3 min-w-0">
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            isFile
              ? "bg-zinc-100 dark:bg-zinc-800"
              : "bg-brand-50 dark:bg-brand-900/20"
          )}>
            {isFile
              ? <FileIcon className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
              : <FolderIcon className="h-4 w-4 text-brand-500 fill-brand-500/20" />
            }
          </div>
          <div className="flex flex-col min-w-0">
            <span
              className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100 max-w-[260px]"
              title={name}
            >
              {name}
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge
                variant="neutral"
                className="text-[10px] px-1.5 py-0 font-normal text-zinc-700 dark:text-zinc-300 dark:bg-zinc-800"
              >
                {isFile ? "File" : "Folder"}
              </Badge>
              {file && (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {formatBytes(file.sizeBytes)}
                </span>
              )}
              {file && (
                <span className="hidden sm:inline text-xs text-zinc-400 dark:text-zinc-500 font-mono truncate max-w-[160px]">
                  {file.driveAccountEmail.slice(0, 3)}***@{file.driveAccountEmail.split("@")[1]}
                </span>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* Dihapus */}
      <td className="hidden md:table-cell px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-zinc-400" />
          {deletedAt ? formatRelativeDate(deletedAt) : "—"}
        </div>
      </td>

      {/* Sisa waktu */}
      <td className="px-4 py-3 whitespace-nowrap">
        {deletedAt ? <DaysRemainingBadge deletedAt={deletedAt} /> : <span className="text-zinc-400">—</span>}
      </td>

      {/* Actions */}
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800/50 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-400 dark:hover:border-emerald-800 transition-colors"
            onClick={onRestore}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Pulihkan</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/30 transition-colors"
            onClick={onPermanentDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Hapus</span>
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ─── Empty State ───────────────────────────────────────────────────────────────

function TrashEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <div className="relative">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800/60 shadow-inner">
          <Trash2 className="h-10 w-10 text-zinc-300 dark:text-zinc-600" />
        </div>
        <div className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        </div>
      </div>
      <div className="text-center">
        <p className="text-base font-semibold text-zinc-700 dark:text-zinc-300">Trash Kosong</p>
        <p className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">
          Tidak ada file atau folder yang sedang di Trash.
        </p>
      </div>
    </div>
  );
}

// ─── Loading Skeleton ──────────────────────────────────────────────────────────

function TrashSkeleton() {
  return (
    <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5 animate-pulse">
          <div className="h-8 w-8 rounded-lg bg-zinc-200 dark:bg-zinc-800 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-48 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-2.5 w-28 rounded bg-zinc-100 dark:bg-zinc-800/60" />
          </div>
          <div className="hidden md:block h-3 w-20 rounded bg-zinc-100 dark:bg-zinc-800/60" />
          <div className="h-5 w-20 rounded-full bg-zinc-100 dark:bg-zinc-800/60" />
          <div className="flex gap-2">
            <div className="h-8 w-20 rounded-md bg-zinc-100 dark:bg-zinc-800/60" />
            <div className="h-8 w-16 rounded-md bg-zinc-100 dark:bg-zinc-800/60" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({
  title,
  count,
  icon: Icon,
  expanded,
  onToggle,
}: {
  title: string;
  count: number;
  icon: React.ElementType;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
        <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{title}</span>
        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-700 px-1.5 text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
          {count}
        </span>
      </div>
      {expanded
        ? <ChevronUp className="h-4 w-4 text-zinc-400" />
        : <ChevronDown className="h-4 w-4 text-zinc-400" />
      }
    </button>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

function TrashPage() {
  const { toast } = useToast();

  const { data: trashData, isLoading } = useTrashItems();
  const isFetchingData = useMinLoading(isLoading, 600);

  const restoreFile = useRestoreFile();
  const restoreFolder = useRestoreFolder();
  const permanentDeleteFile = usePermanentDeleteFile();
  const permanentDeleteFolder = usePermanentDeleteFolder();
  const emptyTrash = useEmptyTrash();

  const [foldersExpanded, setFoldersExpanded] = useState(true);
  const [filesExpanded, setFilesExpanded] = useState(true);

  // Confirm delete state
  const [confirmDelete, setConfirmDelete] = useState<{
    id: number;
    name: string;
    type: "file" | "folder";
  } | null>(null);

  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const folders = trashData?.folders ?? [];
  const files = trashData?.files ?? [];
  const totalItems = folders.length + files.length;

  // Sort by expiring soonest first
  const sortedFolders = useMemo(
    () => [...folders].sort((a, b) => {
      const da = getDaysRemaining(a.deletedAt ?? "");
      const db = getDaysRemaining(b.deletedAt ?? "");
      return da - db;
    }),
    [folders]
  );

  const sortedFiles = useMemo(
    () => [...files].sort((a, b) => {
      const da = getDaysRemaining(a.deletedAt ?? "");
      const db = getDaysRemaining(b.deletedAt ?? "");
      return da - db;
    }),
    [files]
  );

  // Expire soon counts
  const expiringSoon = useMemo(
    () => [...folders, ...files].filter(i => getDaysRemaining(i.deletedAt ?? "") <= 7).length,
    [folders, files]
  );

  const handleRestoreFile = async (id: number) => {
    try {
      await restoreFile.mutateAsync(id);
      toast({ title: "File berhasil dipulihkan", description: "File dikembalikan ke lokasi asalnya.", variant: "success" });
    } catch (e) {
      toast({ title: "Gagal memulihkan file", description: e instanceof Error ? e.message : undefined, variant: "error" });
    }
  };

  const handleRestoreFolder = async (id: number) => {
    try {
      await restoreFolder.mutateAsync(id);
      toast({ title: "Folder berhasil dipulihkan", description: "Folder dikembalikan ke lokasi asalnya.", variant: "success" });
    } catch (e) {
      toast({ title: "Gagal memulihkan folder", description: e instanceof Error ? e.message : undefined, variant: "error" });
    }
  };

  const handleConfirmPermanentDelete = async () => {
    if (!confirmDelete) return;
    try {
      if (confirmDelete.type === "file") {
        await permanentDeleteFile.mutateAsync(confirmDelete.id);
      } else {
        await permanentDeleteFolder.mutateAsync(confirmDelete.id);
      }
      toast({
        title: "Dihapus permanen",
        description: `"${confirmDelete.name}" dihapus dari Google Drive.`,
        variant: "success",
      });
    } catch (e) {
      toast({ title: "Gagal menghapus", description: e instanceof Error ? e.message : undefined, variant: "error" });
    } finally {
      setConfirmDelete(null);
    }
  };

  const handleConfirmEmptyTrash = async () => {
    try {
      const result = await emptyTrash.mutateAsync();
      toast({
        title: "Trash dikosongkan",
        description: `${result.deletedFiles} file dan ${result.deletedFolders} folder dihapus permanen.`,
        variant: "success",
      });
    } catch (e) {
      toast({ title: "Gagal mengosongkan Trash", description: e instanceof Error ? e.message : undefined, variant: "error" });
    } finally {
      setConfirmEmpty(false);
    }
  };

  const isPendingDelete = permanentDeleteFile.isPending || permanentDeleteFolder.isPending;

  return (
    <PageTransition>
      <div className="flex h-full flex-col gap-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                <Trash2 className="h-4.5 w-4.5 text-red-600 dark:text-red-400" />
              </span>
              Trash
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Item yang dihapus tersimpan selama 30 hari sebelum dihapus permanen.
            </p>
          </div>
          {totalItems > 0 && (
            <Button
              variant="destructive"
              className="self-start gap-2 shrink-0"
              onClick={() => setConfirmEmpty(true)}
              disabled={emptyTrash.isPending}
            >
              <Trash2 className="h-4 w-4" />
              Kosongkan Trash
            </Button>
          )}
        </div>

        {/* Info banner jika ada item yang akan expire segera */}
        {expiringSoon > 0 && !isFetchingData && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-900/10 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-400">
              <strong>{expiringSoon} item</strong> akan dihapus permanen dalam 7 hari ke depan.
              Pulihkan sekarang jika masih diperlukan.
            </p>
          </div>
        )}

        {/* Auto-delete info */}
        <div className="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-4 py-2.5">
          <Package className="h-4 w-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Item di Trash otomatis dihapus permanen setelah <strong>30 hari</strong>.
            File yang masuk Trash dengan status publik otomatis diubah ke <strong>private</strong>.
          </p>
        </div>

        {/* Table Card */}
        <Card className="flex flex-1 flex-col overflow-hidden shadow-sm">
          <CardContent className="flex flex-1 flex-col gap-0 overflow-hidden p-0">
            {isFetchingData ? (
              <div className="p-5">
                <TrashSkeleton />
              </div>
            ) : totalItems === 0 ? (
              <TrashEmptyState />
            ) : (
              <div className="flex-1 overflow-auto">
                <table className="w-full caption-bottom text-sm">
                  <thead className="border-b border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/60 sticky top-0 z-10 backdrop-blur-sm">
                    <tr>
                      <th className="h-10 px-4 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 w-[55%]">
                        Nama
                      </th>
                      <th className="hidden md:table-cell h-10 px-4 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 w-[15%]">
                        Dihapus
                      </th>
                      <th className="h-10 px-4 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 w-[15%]">
                        Sisa Waktu
                      </th>
                      <th className="h-10 px-4 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 w-[15%] pr-6">
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">

                    {/* ── Folders Section ─────────────────────────────── */}
                    {sortedFolders.length > 0 && (
                      <>
                        <tr>
                          <td colSpan={4} className="bg-zinc-50/60 dark:bg-zinc-900/30 border-b border-zinc-100 dark:border-zinc-800">
                            <SectionHeader
                              title="Folder"
                              count={sortedFolders.length}
                              icon={FolderIcon}
                              expanded={foldersExpanded}
                              onToggle={() => setFoldersExpanded(v => !v)}
                            />
                          </td>
                        </tr>
                        {foldersExpanded && sortedFolders.map((folder) => (
                          <TrashItemRow
                            key={`folder-${folder.id}`}
                            type="folder"
                            item={folder}
                            onRestore={() => handleRestoreFolder(folder.id)}
                            onPermanentDelete={() => setConfirmDelete({
                              id: folder.id,
                              name: folder.name,
                              type: "folder",
                            })}
                          />
                        ))}
                      </>
                    )}

                    {/* ── Files Section ────────────────────────────────── */}
                    {sortedFiles.length > 0 && (
                      <>
                        <tr>
                          <td colSpan={4} className="bg-zinc-50/60 dark:bg-zinc-900/30 border-b border-zinc-100 dark:border-zinc-800">
                            <SectionHeader
                              title="File"
                              count={sortedFiles.length}
                              icon={FileIcon}
                              expanded={filesExpanded}
                              onToggle={() => setFilesExpanded(v => !v)}
                            />
                          </td>
                        </tr>
                        {filesExpanded && sortedFiles.map((file) => (
                          <TrashItemRow
                            key={`file-${file.id}`}
                            type="file"
                            item={file}
                            onRestore={() => handleRestoreFile(file.id)}
                            onPermanentDelete={() => setConfirmDelete({
                              id: file.id,
                              name: file.filename,
                              type: "file",
                            })}
                          />
                        ))}
                      </>
                    )}

                  </tbody>
                </table>
              </div>
            )}

            {/* Footer summary */}
            {!isFetchingData && totalItems > 0 && (
              <div className="border-t border-zinc-200 dark:border-zinc-800 px-4 py-2.5 flex items-center justify-between">
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  {totalItems} item ({folders.length} folder, {files.length} file)
                </span>
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  Auto-delete setelah 30 hari
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Dialogs ────────────────────────────────────────────────────────── */}

      <ConfirmPermanentDeleteDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleConfirmPermanentDelete}
        itemName={confirmDelete?.name ?? ""}
        itemType={confirmDelete?.type ?? "file"}
        isPending={isPendingDelete}
      />

      <ConfirmEmptyTrashDialog
        open={confirmEmpty}
        onClose={() => setConfirmEmpty(false)}
        onConfirm={handleConfirmEmptyTrash}
        totalItems={totalItems}
        isPending={emptyTrash.isPending}
      />
    </PageTransition>
  );
}
