import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useState, useCallback, useRef, type DragEvent, useEffect } from "react";
import {
  Search, Trash2, Copy, Eye, EyeOff,
  Folder as FolderIcon, FolderPlus, Upload,
  ChevronRight, UploadCloud, CheckCircle2, XCircle,
  FileIcon, X, Loader2, Home,
} from "lucide-react";
import {
  Card, CardContent, Input, Button, Badge, Skeleton,
  Dialog, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, useToast, Progress, cn,
} from "@nqdrive/ui";
import { formatBytes, formatSpeed } from "@nqdrive/shared";
import { useFiles, useDeleteFile, useUpdateFileVisibility } from "../hooks/use-files";
import { useFolderByPath, useCreateFolder, useDeleteFolder } from "../hooks/use-folders";
import { useUpload } from "../hooks/use-upload";
import type { FileVisibility, FileWithAccount, Folder } from "@nqdrive/types";

// ─── URL schema: ?path=Dokumen/Proyek/2025 ───────────────────────────────────
const searchSchema = z.object({
  path: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/dashboard/files")({
  validateSearch: searchSchema,
  component: FilesPage,
});

const VISIBILITY_LABEL: Record<FileVisibility, string> = {
  public: "Public",
  private: "Private",
  hidden: "Hidden",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  return `${local.slice(0, 3)}***@${domain}`;
}

function EmailCell({ email }: { email: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm text-zinc-500 dark:text-zinc-400 font-mono">
        {shown ? email : maskEmail(email)}
      </span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setShown((v) => !v); }}
        className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
        title={shown ? "Sembunyikan email" : "Tampilkan email"}
      >
        {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

/**
 * Breadcrumb component — renders clickable path segments.
 * e.g.  Home / Dokumen / Proyek / 2025
 */
function Breadcrumb({
  ancestors,
  currentFolder,
  onNavigate,
}: {
  ancestors: Folder[];
  currentFolder: Folder | null;
  onNavigate: (path: string) => void;
}) {
  // Build cumulative path for each segment
  const buildPath = (upTo: number) =>
    [...ancestors, currentFolder]
      .slice(0, upTo + 1)
      .map((f) => encodeURIComponent(f!.name))
      .join("/");

  return (
    <nav className="flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400 flex-wrap">
      <button
        type="button"
        onClick={() => onNavigate("")}
        className="flex items-center gap-1 hover:text-brand-600 dark:hover:text-brand-400 transition-colors font-medium"
      >
        <Home className="h-3.5 w-3.5" />
        <span>Root</span>
      </button>

      {ancestors.map((folder, idx) => (
        <span key={folder.id} className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5 text-zinc-300 dark:text-zinc-600" />
          <button
            type="button"
            onClick={() => onNavigate(buildPath(idx))}
            className="hover:text-brand-600 dark:hover:text-brand-400 transition-colors max-w-[120px] truncate"
            title={folder.name}
          >
            {folder.name}
          </button>
        </span>
      ))}

      {currentFolder && (
        <span className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5 text-zinc-300 dark:text-zinc-600" />
          <span className="font-semibold text-zinc-800 dark:text-zinc-200 max-w-[160px] truncate" title={currentFolder.name}>
            {currentFolder.name}
          </span>
        </span>
      )}
    </nav>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function FilesPage() {
  const { toast } = useToast();
  const searchParams = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  // Current path string from URL, e.g. "Dokumen/Proyek/2025" or "" for root
  const currentPath = searchParams.path ?? "";

  // Navigate to a new path — updates URL
  const navigateTo = useCallback(
    (path: string) => {
      navigate({ search: path ? { path } : {} });
    },
    [navigate]
  );

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<FileVisibility | "">("");

  const isSearching = !!search || !!visibilityFilter;

  // Reset pagination when path changes
  useEffect(() => { setPage(1); }, [currentPath]);

  // Dialog states
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  // Delete confirm states
  const [fileToDelete, setFileToDelete] = useState<FileWithAccount | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);

  // ── Data fetching ───────────────────────────────────────────────────────────
  // Primary: resolve the URL path → folderId + children + ancestors
  const {
    data: pathData,
    isLoading: isLoadingPath,
    isFetching: isFetchingPath,
    isError: isPathError,
  } = useFolderByPath(isSearching ? "" : currentPath);

  const currentFolderId = isSearching ? null : (pathData?.folderId ?? null);

  const { data: filesData, isLoading: isLoadingFiles, isFetching: isFetchingFiles } = useFiles({
    folderId: isSearching ? undefined : (currentFolderId !== null ? currentFolderId : 0),
    page,
    pageSize: 10,
    search: search || undefined,
    visibility: visibilityFilter || undefined,
  });

  // If path from URL is not found after loading, reset to root
  useEffect(() => {
    if (isPathError && currentPath) {
      toast({ title: "Folder tidak ditemukan", description: "Kembali ke root.", variant: "error" });
      navigateTo("");
    }
  }, [isPathError, currentPath, navigateTo, toast]);

  const isFetchingData = isLoadingPath || isLoadingFiles || isFetchingPath || isFetchingFiles;

  // ── Mutations ───────────────────────────────────────────────────────────────
  const createFolder = useCreateFolder();
  const deleteFolder = useDeleteFolder();
  const deleteFile = useDeleteFile();
  const updateVisibility = useUpdateFileVisibility();

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleFolderClick = (folder: Folder) => {
    // Build new path by appending folder name to current path
    const newPath = currentPath
      ? `${currentPath}/${encodeURIComponent(folder.name)}`
      : encodeURIComponent(folder.name);
    navigateTo(newPath);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await createFolder.mutateAsync({
        name: newFolderName.trim(),
        parentFolderId: currentFolderId,
      });
      toast({ title: "Folder berhasil dibuat", variant: "success" });
      setNewFolderName("");
      setIsCreateFolderOpen(false);
    } catch (error) {
      toast({
        title: "Gagal membuat folder",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    }
  };

  const handleDeleteFolder = async () => {
    if (!folderToDelete) return;
    try {
      await deleteFolder.mutateAsync(folderToDelete.id);
      toast({ title: "Folder berhasil dihapus", variant: "success" });
    } catch (error) {
      toast({
        title: "Gagal menghapus folder",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setFolderToDelete(null);
    }
  };

  const handleCopyLink = (file: FileWithAccount) => {
    const url = `${window.location.origin}/${file.slug}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link disalin", description: url, variant: "success" });
  };

  const handleDeleteFile = async () => {
    if (!fileToDelete) return;
    try {
      await deleteFile.mutateAsync(fileToDelete.id);
      toast({ title: "File berhasil dihapus", variant: "success" });
    } catch (error) {
      toast({
        title: "Gagal menghapus file",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setFileToDelete(null);
    }
  };

  const handleVisibilityChange = async (file: FileWithAccount, visibility: FileVisibility) => {
    try {
      await updateVisibility.mutateAsync({ id: file.id, visibility });
      toast({ title: "Visibilitas diperbarui", variant: "success" });
    } catch (error) {
      toast({
        title: "Gagal memperbarui visibilitas",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    }
  };

  // Folders to display — only show when not searching
  const foldersList = isSearching ? [] : (pathData?.children ?? []);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Files</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Kelola folder dan file di virtual storage Anda.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsCreateFolderOpen(true)}>
            <FolderPlus className="h-4 w-4 mr-1.5" />
            Folder Baru
          </Button>
          <Button onClick={() => setIsUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-1.5" />
            Upload File
          </Button>
        </div>
      </div>

      <Card className="flex flex-1 flex-col overflow-hidden shadow-sm">
        <CardContent className="flex flex-1 flex-col gap-4 overflow-hidden p-5">

          {/* Breadcrumb — always visible, shows current path */}
          {!isSearching && (
            <Breadcrumb
              ancestors={pathData?.ancestors ?? []}
              currentFolder={pathData?.folder ?? null}
              onNavigate={navigateTo}
            />
          )}

          {/* Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input
                placeholder="Cari nama file..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9 bg-zinc-50 dark:bg-zinc-900"
              />
            </div>
            <select
              value={visibilityFilter}
              onChange={(e) => { setVisibilityFilter(e.target.value as FileVisibility | ""); setPage(1); }}
              className="h-10 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm focus:ring-2 focus:ring-brand-500/20 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <option value="">Semua Visibilitas</option>
              <option value="public">Public</option>
              <option value="private">Private</option>
              <option value="hidden">Hidden</option>
            </select>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 relative">
            {isFetchingData && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/60 backdrop-blur-sm dark:bg-zinc-950/60 animate-in fade-in duration-500">
                <Loader2 className="h-8 w-8 animate-spin text-brand-500" style={{ animationDuration: "2s" }} />
                <p className="mt-3 text-sm font-medium text-zinc-600 dark:text-zinc-400">Memuat...</p>
              </div>
            )}

            <table className="w-full caption-bottom text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/60 sticky top-0 z-10 backdrop-blur-sm">
                <tr>
                  <th className="h-10 w-[55%] px-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Nama
                  </th>
                  <th className="h-10 w-[20%] px-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Visibilitas
                  </th>
                  <th className="h-10 w-[10%] px-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Download
                  </th>
                  <th className="h-10 w-[15%] px-4 text-right align-middle text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">

                {/* Folders */}
                {foldersList.map((folder) => (
                  <tr
                    key={`folder-${folder.id}`}
                    onClick={() => handleFolderClick(folder)}
                    className="group cursor-pointer hover:bg-brand-50/50 dark:hover:bg-brand-900/10 transition-all duration-200"
                  >
                    <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100 min-w-0">
                      <div className="flex items-center gap-2">
                        <FolderIcon className="h-4 w-4 text-brand-500 fill-brand-500/20 shrink-0" />
                        <div className="flex flex-col">
                          <span className="break-words whitespace-normal" title={folder.name}>
                            {folder.name}
                          </span>
                          <span className="text-xs text-zinc-500 font-normal mt-0.5">
                            {folder.sizeBytes ? formatBytes(folder.sizeBytes) : "0 B"}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 dark:text-zinc-500">—</td>
                    <td className="px-4 py-3 text-zinc-400 dark:text-zinc-500">—</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); setFolderToDelete(folder); }}
                          title="Hapus folder"
                          className="hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}

                {/* Files */}
                {filesData?.items.map((file) => (
                  <tr
                    key={`file-${file.id}`}
                    className="group hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-zinc-700 dark:text-zinc-300 min-w-0">
                      <div className="flex items-center gap-2">
                        <FileIcon className="h-4 w-4 text-zinc-400 shrink-0" />
                        <div className="flex flex-col">
                          <span className="break-words whitespace-normal" title={file.filename}>
                            {file.filename}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-zinc-500 font-normal">{formatBytes(file.sizeBytes)}</span>
                            <EmailCell email={file.driveAccountEmail} />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={file.visibility}
                        onChange={(e) => handleVisibilityChange(file, e.target.value as FileVisibility)}
                        className="w-full cursor-pointer rounded-md border border-transparent bg-brand-500 text-white hover:bg-brand-600 focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20 font-medium px-3 py-1.5 text-xs transition-colors dark:bg-brand-600 dark:hover:bg-brand-700"
                      >
                        <option value="public" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Public</option>
                        <option value="private" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Private</option>
                        <option value="hidden" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Hidden</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{file.downloadCount}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopyLink(file)}
                          title="Salin link publik"
                          className="hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-900/30"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setFileToDelete(file)}
                          title="Hapus file"
                          className="hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}

                {/* Empty state */}
                {!isFetchingData && foldersList.length === 0 && (!filesData || filesData.items.length === 0) && (
                  <tr>
                    <td colSpan={4} className="py-16 text-center text-sm text-zinc-400 dark:text-zinc-500">
                      <div className="flex flex-col items-center gap-2">
                        <FolderIcon className="h-10 w-10 text-zinc-300 dark:text-zinc-700" />
                        <p>
                          {isSearching
                            ? "Tidak ada file yang cocok dengan filter."
                            : "Folder ini kosong. Upload file atau buat subfolder."}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filesData && filesData.totalPages > 1 && (
            <div className="flex items-center justify-between pt-1">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Halaman {filesData.page} dari {filesData.totalPages} ({filesData.totalItems} file)
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Sebelumnya
                </Button>
                <Button variant="outline" size="sm" disabled={page >= filesData.totalPages} onClick={() => setPage((p) => p + 1)}>
                  Berikutnya
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Dialogs ─────────────────────────────────────────────────────────── */}

      <Dialog open={!!fileToDelete} onOpenChange={(open) => !open && setFileToDelete(null)}>
        <DialogHeader>
          <DialogTitle>Hapus file?</DialogTitle>
          <DialogDescription>
            File "{fileToDelete?.filename}" akan dihapus permanen dari Google Drive dan tidak dapat dikembalikan.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setFileToDelete(null)}>Batal</Button>
          <Button variant="destructive" onClick={handleDeleteFile} disabled={deleteFile.isPending}>
            {deleteFile.isPending ? "Menghapus..." : "Hapus"}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={!!folderToDelete} onOpenChange={(open) => !open && setFolderToDelete(null)}>
        <DialogHeader>
          <DialogTitle>Hapus folder?</DialogTitle>
          <DialogDescription>
            Folder "{folderToDelete?.name}" dan seluruh sub-folder di dalamnya akan dihapus. File di dalamnya akan dipindahkan ke root.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setFolderToDelete(null)}>Batal</Button>
          <Button variant="destructive" onClick={handleDeleteFolder} disabled={deleteFolder.isPending}>
            {deleteFolder.isPending ? "Menghapus..." : "Hapus"}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
        <DialogHeader>
          <DialogTitle>Buat Folder Baru</DialogTitle>
          <DialogDescription>
            {currentPath
              ? `Akan dibuat di: ${decodeURIComponent(currentPath)}`
              : "Akan dibuat di root."}
          </DialogDescription>
        </DialogHeader>
        <Input
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          placeholder="Nama folder"
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsCreateFolderOpen(false)}>Batal</Button>
          <Button onClick={handleCreateFolder} disabled={createFolder.isPending}>
            {createFolder.isPending ? "Membuat..." : "Buat Folder"}
          </Button>
        </DialogFooter>
      </Dialog>

      <UploadDialog
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        currentFolderId={currentFolderId}
        currentPath={currentPath}
      />
    </div>
  );
}

// ─── Upload dialog ────────────────────────────────────────────────────────────

function UploadDialog({
  open,
  onOpenChange,
  currentFolderId,
  currentPath,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentFolderId: number | null;
  currentPath: string;
}) {
  const { items, uploadFile, cancelUpload, removeItem } = useUpload();
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      Array.from(files).forEach((file) => uploadFile(file, currentFolderId));
    },
    [uploadFile, currentFolderId]
  );

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingOver(false);
    handleFiles(event.dataTransfer.files);
  };

  useEffect(() => {
    if (!open) return;
    if (items.length > 0) {
      const allFinished = items.every(
        (i) => i.status === "success" || i.status === "error" || i.status === "cancelled"
      );
      const hasSuccess = items.some((i) => i.status === "success");
      if (allFinished && hasSuccess) {
        const timer = setTimeout(() => onOpenChange(false), 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [items, open, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Upload File</DialogTitle>
        <DialogDescription>
          {currentPath
            ? `Upload ke: ${decodeURIComponent(currentPath)}`
            : "Upload ke root."}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed py-10 transition-colors",
            isDraggingOver
              ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20"
              : "border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900"
          )}
        >
          <UploadCloud className="h-8 w-8 text-zinc-400" />
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 text-center px-4">
            Seret file ke sini, atau{" "}
            <span className="text-brand-600 dark:text-brand-400">klik untuk memilih</span>
          </p>
          <p className="text-xs text-zinc-400">Maksimal 15 GB per file</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        {items.length > 0 && (
          <div className="flex flex-col gap-2 max-h-[40vh] overflow-y-auto pr-1">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-md border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/50 dark:bg-zinc-900/50"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-white dark:bg-zinc-800 shadow-sm border border-zinc-100 dark:border-zinc-700">
                  <FileIcon className="h-4 w-4 text-zinc-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {item.file.name}
                    </p>
                    {item.status === "success" && <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />}
                    {item.status === "error" && <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />}
                  </div>
                  {item.status === "uploading" && (
                    <div className="mt-1.5">
                      <Progress value={item.progress.percentage} className="h-1.5" />
                      <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
                        <span>{item.progress.percentage.toFixed(0)}%</span>
                        <span>{formatSpeed(item.progress.speedBytesPerSecond)}</span>
                      </div>
                    </div>
                  )}
                  {item.status === "error" && (
                    <p className="mt-0.5 text-xs text-red-600 dark:text-red-400 truncate">
                      {item.errorMessage ?? "Upload gagal."}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-zinc-400"
                  onClick={() =>
                    item.status === "uploading" ? cancelUpload(item.id) : removeItem(item.id)
                  }
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Tutup
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
