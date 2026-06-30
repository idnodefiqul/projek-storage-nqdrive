import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useState, useCallback, useRef, type DragEvent, useEffect, useMemo } from "react";
import {
  Search, Trash2, Copy, Eye, EyeOff,
  Folder as FolderIcon, FolderPlus, Upload,
  ChevronRight, UploadCloud, CheckCircle2, XCircle,
  FileIcon, X, Loader2, Home, MoreVertical, Lock, Globe, EyeOff as EyeOffIcon,
  ChevronLeft, ChevronsLeft, ChevronsRight
} from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import {
  Card, CardContent, Input, Button, Badge, Skeleton,
  Dialog, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, useToast, Progress, cn,
} from "@nqdrive/ui";
import { formatBytes, formatSpeed } from "@nqdrive/shared";
import { useFiles, useDeleteFile, useUpdateFileVisibility } from "../hooks/use-files";
import { useFolderByPath, useCreateFolder, useDeleteFolder } from "../hooks/use-folders";
import { useUpload } from "../hooks/use-upload";
import { useMinLoading } from "../hooks/use-min-loading";
import type { FileVisibility, FileWithAccount, Folder } from "@nqdrive/types";
import { PageTransition } from "../components/page-transition";
import { FilesTableSkeleton } from "../components/skeletons";

// ─── URL schema: ?folder=Windows/11/subfolder ────────────────────────────────
// Menggunakan "folder" sebagai nama param (bukan "path") agar URL lebih deskriptif.
// Separator antar level folder adalah "/" literal — tidak di-encode jadi %2F.
// Contoh: /dashboard/files?folder=Scripts
//         /dashboard/files?folder=Windows/11
//         /dashboard/files?folder=Windows/11/namafolder/namafolder
const searchSchema = z.object({
  folder: z.string().optional().catch(undefined),
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
 * e.g.  Root / Windows / 11 / subfolder
 */
function Breadcrumb({
  ancestors,
  currentFolder,
  onNavigate,
}: {
  ancestors: Folder[];
  currentFolder: Folder | null;
  onNavigate: (folderPath: string) => void;
}) {
  // Bangun path kumulatif untuk setiap segment.
  // Format: nama folder bergabung dengan "/" — tidak perlu encode karena
  // navigateTo() akan meneruskan nilai ini ke URL param "folder" secara langsung.
  const buildPath = (upTo: number) =>
    [...ancestors, currentFolder]
      .slice(0, upTo + 1)
      .map((f) => f!.name)
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

// ─── Action Dropdown ──────────────────────────────────────────────────────────

function ActionDropdown({
  file,
  folder,
  onCopyLink,
  onDeleteFile,
  onDeleteFolder,
  onChangeVisibility,
}: {
  file?: FileWithAccount;
  folder?: Folder;
  onCopyLink: (file: FileWithAccount) => void;
  onDeleteFile: (file: FileWithAccount) => void;
  onDeleteFolder: (folder: Folder) => void;
  onChangeVisibility: (file: FileWithAccount, visibility: FileVisibility) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <Button 
        variant="ghost" 
        size="icon" 
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }} 
        className="h-8 w-8 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <MoreVertical className="h-4 w-4" />
      </Button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-48 origin-top-right rounded-md bg-white dark:bg-zinc-900 shadow-lg ring-1 ring-black ring-opacity-5 dark:ring-white dark:ring-opacity-10 focus:outline-none animate-in fade-in zoom-in-95 duration-100">
          <div className="py-1">
            {file && (
              <>
                <div className="px-4 py-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Visibilitas</div>
                {(["public", "private", "hidden"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={(e) => { e.stopPropagation(); onChangeVisibility(file, v); setOpen(false); }}
                    className={cn(
                      "group flex w-full items-center px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors",
                      file.visibility === v && "bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 font-medium"
                    )}
                  >
                    {v === "public" && <Globe className="mr-2 h-4 w-4" />}
                    {v === "private" && <Lock className="mr-2 h-4 w-4" />}
                    {v === "hidden" && <EyeOffIcon className="mr-2 h-4 w-4" />}
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                    {file.visibility === v && <CheckCircle2 className="ml-auto h-4 w-4 text-brand-500" />}
                  </button>
                ))}
                <div className="my-1 border-t border-zinc-200 dark:border-zinc-800" />
                {file.visibility === "public" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onCopyLink(file); setOpen(false); }}
                    className="group flex w-full items-center px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Salin Link
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteFile(file); setOpen(false); }}
                  className="group flex w-full items-center px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Hapus File
                </button>
              </>
            )}
            {folder && (
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteFolder(folder); setOpen(false); }}
                className="group flex w-full items-center px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Hapus Folder
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pagination ──────────────────────────────────────────────────────────────

const PAGE_SIZES = [10, 20, 50];

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
    <div className="flex flex-col gap-3 px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <span>Tampilkan</span>
        <select
          value={pageSize}
          onChange={(e) => { onPageSize(Number(e.target.value)); onPage(1); }}
          className="h-8 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-2 text-sm outline-none focus:border-brand-500"
        >
          {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span>per halaman</span>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-zinc-400">
          {from}–{to} dari {total}
        </span>
        <div className="flex items-center gap-1">
          <PagBtn onClick={() => onPage(1)} disabled={page === 1} title="Halaman pertama">
            <ChevronsLeft className="h-3.5 w-3.5" />
          </PagBtn>
          <PagBtn onClick={() => onPage(page - 1)} disabled={page === 1} title="Sebelumnya">
            <ChevronLeft className="h-3.5 w-3.5" />
          </PagBtn>
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 px-2">
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
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function FilesPage() {
  const { toast } = useToast();
  const searchParams = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  // Path folder saat ini dari URL param "folder".
  // Contoh: "" = root, "Scripts" = folder Scripts, "Windows/11" = subfolder 11 di dalam Windows
  const currentFolderPath = searchParams.folder ?? "";

  // Navigasi ke folder path baru — mengupdate URL param "folder"
  const navigateTo = useCallback(
    (folderPath: string) => {
      navigate({ search: folderPath ? { folder: folderPath } : {} });
    },
    [navigate]
  );

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<FileVisibility | "">("");

  const isSearching = !!search || !!visibilityFilter;

  // Reset pagination saat path berubah
  useEffect(() => { setPage(1); }, [currentFolderPath]);

  // Dialog states
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  // Delete confirm states
  const [fileToDelete, setFileToDelete] = useState<FileWithAccount | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);

  // ── Data fetching ───────────────────────────────────────────────────────────
  // Selalu resolve path aktif — termasuk saat searching — agar folderId tetap tersedia
  const {
    data: pathData,
    isLoading: isLoadingPath,
    isFetching: isFetchingPath,
    isError: isPathError,
  } = useFolderByPath(currentFolderPath);

  // folderId folder aktif (null = root). Berlaku baik saat browse maupun search.
  const currentFolderId = pathData?.folderId ?? null;

  const { data: filesData, isLoading: isLoadingFiles, isFetching: isFetchingFiles } = useFiles({
    // Search selalu scoped ke folder aktif, bukan semua folder global
    folderId: currentFolderId !== null ? currentFolderId : 0,
    page,
    pageSize,
    search: search || undefined,
    visibility: visibilityFilter || undefined,
  });

  // Jika path dari URL tidak ditemukan, kembali ke root
  useEffect(() => {
    if (isPathError && currentFolderPath) {
      toast({ title: "Folder tidak ditemukan", description: "Kembali ke root.", variant: "error" });
      navigateTo("");
    }
  }, [isPathError, currentFolderPath, navigateTo, toast]);

  const isQueryLoading = isLoadingPath || isLoadingFiles;
  const isFetchingData = useMinLoading(isQueryLoading, 600);

  // ── Mutations ───────────────────────────────────────────────────────────────
  const createFolder = useCreateFolder();
  const deleteFolder = useDeleteFolder();
  const deleteFile = useDeleteFile();
  const updateVisibility = useUpdateFileVisibility();

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleFolderClick = useCallback((folder: Folder) => {
    // Append nama folder ke path saat ini dengan separator "/"
    // Tidak perlu encodeURIComponent — navigateTo akan meneruskan ke ?folder= param secara utuh
    const newPath = currentFolderPath
      ? `${currentFolderPath}/${folder.name}`
      : folder.name;
    navigateTo(newPath);
  }, [currentFolderPath, navigateTo]);

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

  const handleCopyLink = useCallback((file: FileWithAccount) => {
    // URL download menggunakan host web ini (drive.fiqul.id) sebagai perantara (proxy) ke Worker
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/${file.slug}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link disalin", description: url, variant: "success" });
  }, [toast]);

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

  const handleVisibilityChange = useCallback(async (file: FileWithAccount, visibility: FileVisibility) => {
    const VISIBILITY_TOAST: Record<
      FileVisibility,
      { title: string; description: string; variant: "success" | "private" | "hidden" }
    > = {
      public:  {
        title: "File is public",
        description: "File dapat diakses dan didownload oleh siapapun.",
        variant: "success",
      },
      private: {
        title: "Private file",
        description: "File hanya bisa diakses melalui dashboard (admin).",
        variant: "private",
      },
      hidden:  {
        title: "Hidden file",
        description: "File tersembunyi dari listing publik.",
        variant: "hidden",
      },
    };

    try {
      await updateVisibility.mutateAsync({ id: file.id, visibility });
      const { title, description, variant } = VISIBILITY_TOAST[visibility];
      toast({ title, description, variant });
    } catch (error) {
      toast({
        title: "Gagal memperbarui visibilitas",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    }
  }, [updateVisibility, toast]);

  const emptyArray = useMemo(() => [], []);
  const foldersList = isSearching ? emptyArray : (pathData?.children ?? emptyArray);
  
  type TableRowData = 
    | { type: "folder"; data: Folder }
    | { type: "file"; data: FileWithAccount };
    
  const tableData: TableRowData[] = useMemo(() => {
    return [
      ...foldersList.map((f) => ({ type: "folder" as const, data: f })),
      ...(filesData?.items ?? emptyArray).map((f) => ({ type: "file" as const, data: f })),
    ];
  }, [foldersList, filesData?.items, emptyArray]);

  const columnHelper = createColumnHelper<TableRowData>();

  const columns = useMemo(() => [
    columnHelper.accessor((row) => row.type === "folder" ? row.data.name : row.data.filename, {
      id: "name",
      header: "Nama",
      cell: (info) => {
        const row = info.row.original;
        if (row.type === "folder") {
          const folder = row.data;
          return (
            <div 
              className="flex items-center gap-2 cursor-pointer group-hover:text-brand-600 transition-colors"
              onClick={() => handleFolderClick(folder)}
            >
              <FolderIcon className="h-4 w-4 text-brand-500 fill-brand-500/20 shrink-0" />
              <div className="flex flex-col">
                <span className="break-words whitespace-normal font-medium" title={folder.name}>
                  {folder.name}
                </span>
                <span className="text-xs text-zinc-500 font-normal mt-0.5">
                  {folder.sizeBytes ? formatBytes(folder.sizeBytes) : "0 B"}
                </span>
              </div>
            </div>
          );
        } else {
          const file = row.data;
          return (
            <div className="flex items-center gap-2">
              <FileIcon className="h-4 w-4 text-zinc-400 shrink-0" />
              <div className="flex flex-col">
                <span className="break-words whitespace-normal font-medium text-zinc-900 dark:text-zinc-100" title={file.filename}>
                  {file.filename}
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-zinc-500 font-normal">{formatBytes(file.sizeBytes)}</span>
                  <EmailCell email={file.driveAccountEmail} />
                </div>
              </div>
            </div>
          );
        }
      },
    }),
    columnHelper.display({
      id: "downloads",
      header: "Download",
      cell: (info) => {
        const row = info.row.original;
        if (row.type === "folder") return <span className="text-zinc-400 dark:text-zinc-500">—</span>;
        return <span className="text-zinc-600 dark:text-zinc-400">{row.data.downloadCount}</span>;
      },
    }),
    columnHelper.display({
      id: "actions",
      header: "Action",
      cell: (info) => {
        const row = info.row.original;
        return (
          <div className="flex justify-end pr-2">
            <ActionDropdown
              file={row.type === "file" ? row.data : undefined}
              folder={row.type === "folder" ? row.data : undefined}
              onCopyLink={handleCopyLink}
              onDeleteFile={setFileToDelete}
              onDeleteFolder={setFolderToDelete}
              onChangeVisibility={handleVisibilityChange}
            />
          </div>
        );
      },
    }),
  ], [handleFolderClick, handleCopyLink, handleVisibilityChange]);

  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <PageTransition>
      <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Files</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Kelola folder dan file di virtual storage Anda.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row">
          <Button onClick={() => setIsCreateFolderOpen(true)} className="w-full sm:w-auto px-2">
            <FolderPlus className="h-4 w-4 mr-1.5 shrink-0" />
            <span className="truncate">Folder Baru</span>
          </Button>
          <Button onClick={() => setIsUploadOpen(true)} className="w-full sm:w-auto px-2">
            <Upload className="h-4 w-4 mr-1.5 shrink-0" />
            <span className="truncate">Upload File</span>
          </Button>
        </div>
      </div>

      <Card className="flex flex-1 flex-col overflow-hidden shadow-sm">
        <CardContent className="flex flex-1 flex-col gap-4 overflow-hidden p-5">

          {/* Breadcrumb */}
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
                placeholder={currentFolderPath ? `Cari dalam "${currentFolderPath.split("/").pop()}"...` : "Cari semua file..."}
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
            <table className="w-full caption-bottom text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/60 sticky top-0 z-10 backdrop-blur-sm">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className={cn(
                          "h-10 px-4 align-middle text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400",
                          header.id === "actions" || header.id === "downloads" ? "text-right" : "text-left",
                          header.id === "name" ? "w-[80%] sm:w-[65%]" : "",
                          header.id === "downloads" ? "hidden sm:table-cell w-[15%]" : "",
                          header.id === "actions" ? "w-[20%] sm:w-[20%] pr-6" : ""
                        )}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                {isFetchingData ? (
                  <FilesTableSkeleton rows={pageSize} />
                ) : table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className="group hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors animate-in fade-in duration-300"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className={cn(
                            "px-4 py-3 min-w-0 align-middle",
                            cell.column.id === "downloads" ? "hidden sm:table-cell text-right" : "",
                            cell.column.id === "actions" ? "text-right" : ""
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={columns.length} className="py-16 text-center text-sm text-zinc-400 dark:text-zinc-500">
                      <div className="flex flex-col items-center gap-2">
                        <FolderIcon className="h-10 w-10 text-zinc-300 dark:text-zinc-700" />
                        <p>
                          {isSearching
                            ? currentFolderPath
                              ? `Tidak ada file yang cocok di folder "${currentFolderPath.split("/").pop()}".`
                              : "Tidak ada file yang cocok dengan filter."
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
          <Pagination
            page={page}
            pageSize={pageSize}
            total={filesData?.totalItems ?? 0}
            onPage={setPage}
            onPageSize={setPageSize}
          />
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
            {currentFolderPath
              ? `Akan dibuat di: ${currentFolderPath}`
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
        currentFolderPath={currentFolderPath}
      />
      </div>
    </PageTransition>
  );
}

// ─── Upload dialog ────────────────────────────────────────────────────────────

function UploadDialog({
  open,
  onOpenChange,
  currentFolderId,
  currentFolderPath,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentFolderId: number | null;
  currentFolderPath: string;
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
          {currentFolderPath
            ? `Upload ke: ${currentFolderPath}`
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
