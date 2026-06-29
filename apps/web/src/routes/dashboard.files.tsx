import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useState, useCallback, useRef, type DragEvent, useEffect } from "react";
import { Search, Trash2, Copy, Eye, EyeOff, Folder as FolderIcon, FolderPlus, Upload, ChevronLeft, UploadCloud, CheckCircle2, XCircle, FileIcon, X, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  Input,
  Button,
  Badge,
  Skeleton,
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  useToast,
  Progress,
  cn,
} from "@nqdrive/ui";
import { formatBytes, formatSpeed, formatDuration } from "@nqdrive/shared";
import { useFiles, useDeleteFile, useUpdateFileVisibility } from "../hooks/use-files";
import { useFolders, useCreateFolder, useDeleteFolder } from "../hooks/use-folders";
import { useUpload } from "../hooks/use-upload";
import type { FileVisibility, FileWithAccount, Folder } from "@nqdrive/types";

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

/** Sensor email: dummy-account@example.com → dum***@example.com */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const visible = local.slice(0, 3);
  return `${visible}***@${domain}`;
}

/** Komponen cell email dengan toggle show/hide */
function EmailCell({ email }: { email: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm text-zinc-500 dark:text-zinc-400 font-mono">
        {shown ? email : maskEmail(email)}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShown((v) => !v);
        }}
        className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
        title={shown ? "Sembunyikan email" : "Tampilkan email"}
      >
        {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function FilesPage() {
  const { toast } = useToast();
  const searchParams = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  
  // States
  // currentFolderId = ID aktual untuk query API
  // URL param ?folder=nama-folder (human-readable)
  const [currentFolderId, setCurrentFolderIdState] = useState<number | null>(null);
  const [resolvedFromUrl, setResolvedFromUrl] = useState(false);

  // Fungsi navigasi: update URL dengan nama folder
  const setCurrentFolderId = (id: number | null, name?: string) => {
    setCurrentFolderIdState(id);
    navigate({ 
      search: id !== null && name ? { folder: name } : {} 
    });
  };
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<FileVisibility | "">("");
  
  const isSearching = !!search || !!visibilityFilter;
  
  // Dialog States
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  
  // Delete States
  const [fileToDelete, setFileToDelete] = useState<FileWithAccount | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);

  // Queries
  // Selalu fetch root folders untuk resolusi nama → ID saat refresh
  const { data: rootFoldersData } = useFolders(null);
  const { data: foldersData, isLoading: isLoadingFolders, isFetching: isFetchingFolders } = useFolders(currentFolderId);
  const { data: filesData, isLoading: isLoadingFiles, isFetching: isFetchingFiles } = useFiles({
    folderId: isSearching ? undefined : (currentFolderId ?? 0),
    page,
    pageSize: 10,
    search: search || undefined,
    visibility: visibilityFilter || undefined,
  });

  // Resolusi nama folder dari URL ke ID saat pertama kali load
  useEffect(() => {
    if (resolvedFromUrl) return;
    const folderName = searchParams.folder;
    if (!folderName) {
      setResolvedFromUrl(true);
      return;
    }
    // Cari dari root folders
    if (rootFoldersData?.folders) {
      const match = rootFoldersData.folders.find(
        (f) => f.name.toLowerCase() === decodeURIComponent(folderName).toLowerCase()
      );
      if (match) {
        setCurrentFolderIdState(match.id);
      } else {
        // Folder tidak ditemukan, reset ke root
        navigate({ search: {} });
      }
      setResolvedFromUrl(true);
    }
  }, [rootFoldersData, searchParams.folder, resolvedFromUrl, navigate]);

  const isFetchingData = isLoadingFolders || isLoadingFiles || isFetchingFolders || isFetchingFiles;

  // Mutations
  const createFolder = useCreateFolder();
  const deleteFolder = useDeleteFolder();
  const deleteFile = useDeleteFile();
  const updateVisibility = useUpdateFileVisibility();

  // Handlers - Folders
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await createFolder.mutateAsync({ name: newFolderName.trim(), parentFolderId: currentFolderId });
      toast({ title: "Folder berhasil dibuat", variant: "success" });
      setNewFolderName("");
      setIsCreateFolderOpen(false);
    } catch (error) {
      toast({ title: "Gagal membuat folder", description: error instanceof Error ? error.message : undefined, variant: "error" });
    }
  };

  const handleDeleteFolder = async () => {
    if (!folderToDelete) return;
    try {
      await deleteFolder.mutateAsync(folderToDelete.id);
      toast({ title: "Folder berhasil dihapus", variant: "success" });
    } catch (error) {
      toast({ title: "Gagal menghapus folder", description: error instanceof Error ? error.message : undefined, variant: "error" });
    } finally {
      setFolderToDelete(null);
    }
  };

  // Handlers - Files
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

  // UI Filtering
  // Jika ada pencarian, kita sembunyikan daftar folder (karena pencarian backend belum men-support pencarian folder by nama,
  // atau biarkan saja kosong jika folder tidak punya list di pencarian)
  const foldersList = isSearching ? [] : (foldersData?.folders || []);

  return (
    <div className="flex h-full flex-col gap-4">
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
          {/* Toolbar: search + filter + breadcrumb */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {currentFolderId !== null ? (
              <Button variant="ghost" size="sm" onClick={() => setCurrentFolderId(null)} className="mr-2 px-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
                <ChevronLeft className="h-4 w-4 mr-1" />
                {searchParams.folder ? (
                  <span>Kembali ke Root &middot; <span className="font-semibold text-zinc-700 dark:text-zinc-300">{decodeURIComponent(searchParams.folder)}</span></span>
                ) : "Kembali ke Root"}
              </Button>
            ) : null}

            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input
                placeholder="Cari nama file..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9 bg-zinc-50 dark:bg-zinc-900"
              />
            </div>
            <select
              value={visibilityFilter}
              onChange={(e) => {
                setVisibilityFilter(e.target.value as FileVisibility | "");
                setPage(1);
              }}
              className="h-10 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm focus:ring-2 focus:ring-brand-500/20 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <option value="">Semua Visibilitas</option>
              <option value="public">Public</option>
              <option value="private">Private</option>
              <option value="hidden">Hidden</option>
            </select>
          </div>

          {/* Tabel File & Folder */}
          <div className="flex-1 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 relative">
            {isFetchingData && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/60 backdrop-blur-sm dark:bg-zinc-950/60 animate-in fade-in duration-500">
                <Loader2 className="h-8 w-8 animate-spin text-brand-500" style={{ animationDuration: '2s' }} />
                <p className="mt-3 text-sm font-medium text-zinc-600 dark:text-zinc-400">Memuat folder...</p>
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
                  {/* Render Folders First */}
                  {foldersList.map((folder) => (
                    <tr
                      key={`folder-${folder.id}`}
                      onClick={() => setCurrentFolderId(folder.id, folder.name)}
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
                      <td className="px-4 py-3 text-zinc-400 dark:text-zinc-500">-</td>
                      <td className="px-4 py-3 text-zinc-400 dark:text-zinc-500">-</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFolderToDelete(folder);
                            }}
                            title="Hapus folder"
                            className="hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {/* Render Files */}
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
                            <span className="text-xs text-zinc-500 font-normal mt-0.5">
                              {formatBytes(file.sizeBytes)}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={file.visibility}
                          onChange={(e) =>
                            handleVisibilityChange(file, e.target.value as FileVisibility)
                          }
                          className="w-full cursor-pointer rounded-md border border-transparent bg-brand-500 text-white hover:bg-brand-600 focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20 font-medium px-3 py-1.5 text-xs transition-colors dark:bg-brand-600 dark:hover:bg-brand-700"
                        >
                          <option value="public" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Public</option>
                          <option value="private" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Private</option>
                          <option value="hidden" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">Hidden</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {file.downloadCount}
                      </td>
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

                  {foldersList.length === 0 && filesData?.items.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-16 text-center text-sm text-zinc-400 dark:text-zinc-500"
                      >
                        <div className="flex flex-col items-center gap-2">
                          <FolderIcon className="h-10 w-10 text-zinc-300 dark:text-zinc-700" />
                          <p>Folder ini kosong. Upload file pertama Anda.</p>
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
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Sebelumnya
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= filesData.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Berikutnya
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Hapus File */}
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

      {/* Dialog Hapus Folder */}
      <Dialog open={!!folderToDelete} onOpenChange={(open) => !open && setFolderToDelete(null)}>
        <DialogHeader>
          <DialogTitle>Hapus folder?</DialogTitle>
          <DialogDescription>
            Folder "{folderToDelete?.name}" dan seluruh isinya akan dihapus. File di dalamnya akan dipindahkan ke root.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setFolderToDelete(null)}>Batal</Button>
          <Button variant="destructive" onClick={handleDeleteFolder} disabled={deleteFolder.isPending}>
            {deleteFolder.isPending ? "Menghapus..." : "Hapus"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Dialog Buat Folder */}
      <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
        <DialogHeader>
          <DialogTitle>Buat Folder Baru</DialogTitle>
          <DialogDescription>Masukkan nama untuk folder baru.</DialogDescription>
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

      {/* Dialog Upload */}
      <UploadDialog 
        open={isUploadOpen} 
        onOpenChange={setIsUploadOpen} 
        currentFolderId={currentFolderId} 
      />
    </div>
  );
}

function UploadDialog({ open, onOpenChange, currentFolderId }: { open: boolean, onOpenChange: (open: boolean) => void, currentFolderId: number | null }) {
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

  // Tutup otomatis jika semua upload selesai
  useEffect(() => {
    if (!open) return; // ignore if already closed
    if (items.length > 0) {
      const allFinished = items.every(i => i.status === "success" || i.status === "error" || i.status === "cancelled");
      const hasSuccess = items.some(i => i.status === "success");
      
      if (allFinished && hasSuccess) {
        // Beri jeda 1.5 detik agar user bisa melihat centang sukses, baru ditutup
        const timer = setTimeout(() => {
          onOpenChange(false);
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [items, open, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Upload File</DialogTitle>
        <DialogDescription>
          File akan di-upload ke {currentFolderId === null ? "root folder" : "folder saat ini"}.
        </DialogDescription>
      </DialogHeader>
      
      <div className="flex flex-col gap-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingOver(true);
          }}
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
            Seret file ke sini, atau <span className="text-brand-600 dark:text-brand-400">klik untuk memilih</span>
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
              <div key={item.id} className="flex items-center gap-3 rounded-md border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/50 dark:bg-zinc-900/50">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-white dark:bg-zinc-800 shadow-sm border border-zinc-100 dark:border-zinc-700">
                  <FileIcon className="h-4 w-4 text-zinc-500" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.file.name}</p>
                    {/* Centang persis di kanan nama file */}
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
                    <p className="mt-0.5 text-xs text-red-600 dark:text-red-400 truncate">{item.errorMessage ?? "Upload gagal."}</p>
                  )}
                </div>

                {item.status === "uploading" ? (
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-zinc-400" onClick={() => cancelUpload(item.id)}>
                    <X className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-zinc-400" onClick={() => removeItem(item.id)}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
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
