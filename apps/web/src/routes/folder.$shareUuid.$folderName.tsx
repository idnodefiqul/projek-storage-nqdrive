import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Copy, Download, DownloadCloud, FileArchive, FileAudio, FileCode,
  File as FileIcon, FileImage, FileSpreadsheet, FileText, FileVideo, Folder as FolderIcon,
  Home, LayoutGrid, List, Loader2, Menu, Moon, Presentation, Search, Share2, Shield, ShieldCheck, Sparkles, Sun, X,
} from "lucide-react";
import { motion } from "framer-motion";
import QRCode from "qrcode";
import { Button, Dialog, DialogContent, Particles } from "@nqdrive/ui";
import { formatBytes, slugifyFilename } from "@nqdrive/shared";
import type { Folder } from "@nqdrive/types";
import { useTheme } from "../stores/theme-provider";
import { logoMainPng } from "../assets";
import { applyBrandFromDb } from "../stores/theme-provider";

const searchSchema = z.object({
  path: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/folder/$shareUuid/$folderName")({
  validateSearch: searchSchema,
  component: PublicFolderPage,
});

const SITE_NAME = (import.meta.env.VITE_SITE_NAME as string) || "FQDrive";
const WORKER_BASE = (import.meta.env.VITE_WORKER_URL as string | undefined) ?? "";

interface PublicConfig {
  brand_color: string;
  theme_mode: string;
}

interface PublicFolderFile {
  filename: string;
  sizeBytes: number;
  mimeType: string;
}

interface PublicFolderData {
  rootName: string;
  folderName: string;
  currentPath: string;
  subfolders: Folder[];
  files: PublicFolderFile[];
  breadcrumb: string[];
}

type SortKey = "name" | "size" | "type";
type SortDir = "asc" | "desc";

interface FileTypeMeta {
  Icon: typeof FileIcon;
  color: string;
  label: string;
}

function getFileTypeMeta(mime: string, filename: string): FileTypeMeta {
  const ext = filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();
  const m = mime.toLowerCase();

  if (["zip", "rar", "tar", "gz", "7z"].includes(ext) || m.includes("zip") || m.includes("compressed"))
    return { Icon: FileArchive, color: "text-blue-500", label: "Archive" };
  if (ext === "pdf" || m.includes("pdf"))
    return { Icon: FileText, color: "text-red-500", label: "PDF" };
  if (["xlsx", "xls", "csv"].includes(ext) || m.includes("spreadsheet") || m.includes("excel"))
    return { Icon: FileSpreadsheet, color: "text-green-500", label: "Spreadsheet" };
  if (["pptx", "ppt"].includes(ext) || m.includes("presentation") || m.includes("powerpoint"))
    return { Icon: Presentation, color: "text-orange-500", label: "Presentation" };
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext) || m.includes("image"))
    return { Icon: FileImage, color: "text-blue-500", label: "Image" };
  if (["doc", "docx"].includes(ext) || m.includes("word") || m.includes("document"))
    return { Icon: FileText, color: "text-sky-500", label: "Document" };
  if (m.includes("audio") || ["mp3", "wav", "flac", "ogg", "m4a"].includes(ext))
    return { Icon: FileAudio, color: "text-violet-500", label: "Audio" };
  if (m.includes("video") || ["mp4", "mkv", "mov", "webm", "avi"].includes(ext))
    return { Icon: FileVideo, color: "text-rose-500", label: "Video" };
  if (["js", "ts", "json", "html", "css", "tsx", "jsx"].includes(ext) || m.includes("code") || m.includes("text/plain"))
    return { Icon: FileCode, color: "text-amber-500", label: "Code" };

  const sub = mime.split("/")[1];
  return { Icon: FileIcon, color: "text-zinc-400 dark:text-zinc-500", label: sub ? sub.toUpperCase() : "File" };
}

const itemVariant = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

function PublicFolderPage() {
  const { shareUuid, folderName } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { theme, toggleTheme } = useTheme();

  const [currentPath, setCurrentPath] = useState(search.path ?? "");
  const [subfolders, setSubfolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<PublicFolderFile[]>([]);
  const [breadcrumbLabels, setBreadcrumbLabels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const rootLabel = useMemo(() => decodeURIComponent(folderName), [folderName]);

  useEffect(() => {
    fetch(`${WORKER_BASE}/config`, { headers: { "X-App-Client": "nqdrive-web" } })
      .then((res) => res.json())
      .then((json: any) => {
        if (json.success && json.data) {
          const cfg = json.data as PublicConfig;
          if (cfg.theme_mode === "dark" || cfg.theme_mode === "light") {
            applyBrandFromDb(cfg.brand_color, cfg.theme_mode);
          }
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setCurrentPath(search.path ?? "");
  }, [search.path]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${WORKER_BASE}/resource/folder/${shareUuid}?${encodeURIComponent(rootLabel)}=${encodeURIComponent(currentPath)}`, {
      headers: { "X-App-Client": "nqdrive-web" },
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Folder tidak ditemukan.");
        return json.data as PublicFolderData;
      })
      .then((data) => {
        setSubfolders(data.subfolders);
        setFiles(data.files);
        setBreadcrumbLabels(data.breadcrumb ?? []);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [currentPath, shareUuid, rootLabel]);

  useEffect(() => {
    if (!shareOpen) return;
    QRCode.toDataURL(window.location.href, { width: 240, margin: 2 }).then(setQrDataUrl).catch(() => setQrDataUrl(""));
  }, [shareOpen]);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

  const pathSegments = currentPath.split("/").filter(Boolean);

  const goToPath = (path: string) => {
    setCurrentPath(path);
    navigate({ search: { path: path || undefined } as any });
  };

  const openFolder = (folder: Folder) => {
    goToPath(currentPath ? `${currentPath}/${slugifyFilename(folder.name)}` : slugifyFilename(folder.name));
  };

  const buildDownloadUrl = (file: PublicFolderFile) =>
    `/public/folder/${shareUuid}/${[...pathSegments, slugifyFilename(file.filename)].join("/")}`;

  useEffect(() => { setPage(1); }, [searchQuery]);
  const q = searchQuery.trim().toLowerCase();
  const filteredSubfolders = q ? subfolders.filter((f) => f.name.toLowerCase().includes(q)) : subfolders;
  const filteredFiles = q ? files.filter((f) => f.filename.toLowerCase().includes(q)) : files;

  const sortedFiles = useMemo(() => {
    const copy = [...filteredFiles];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.filename.localeCompare(b.filename);
      else if (sortKey === "size") cmp = a.sizeBytes - b.sizeBytes;
      else cmp = getFileTypeMeta(a.mimeType, a.filename).label.localeCompare(getFileTypeMeta(b.mimeType, b.filename).label);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filteredFiles, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const totalItems = subfolders.length + files.length;
  const totalSize = files.reduce((sum, f) => sum + f.sizeBytes, 0);
  const hasItems = filteredSubfolders.length > 0 || filteredFiles.length > 0;

  const downloadAll = () => {
    files.forEach((file, index) => {
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = buildDownloadUrl(file);
        a.download = file.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, index * 400);
    });
  };

  const copyShareLink = () => navigator.clipboard.writeText(window.location.href);

  return (
    <div className="relative min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 font-sans selection:bg-brand-500/30">
      {/* Background Decor */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-brand-500/5 blur-[120px] dark:bg-brand-500/10" />
        <Particles className="absolute inset-0 opacity-40 dark:opacity-20" quantity={30} />
      </div>

      {/* Header */}
      <header className="fixed left-0 right-0 top-0 z-50 flex h-16 items-center justify-between border-b border-zinc-200 bg-white/75 px-6 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-zinc-950/75">
        <Link to="/" className="flex items-center transition-opacity hover:opacity-80" aria-label="Home">
          <img src={logoMainPng} alt={SITE_NAME} className="h-9 w-auto object-contain" />
        </Link>
        <nav className="hidden items-center gap-2 sm:flex sm:gap-4">
          <Link to="/" className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:text-brand-600 dark:text-zinc-400 dark:hover:text-brand-400">
            <Home className="h-4 w-4" /> Home
          </Link>
          <Link to="/privacy-policy" className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:text-brand-600 dark:text-zinc-400 dark:hover:text-brand-400">
            <Shield className="h-4 w-4" /> Privacy Policy
          </Link>
          <Button variant="ghost" size="icon" onClick={toggleTheme} className="rounded-full">
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </Button>
        </nav>
        <div className="flex sm:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(true)} className="rounded-full">
            <Menu className="h-5 w-5 text-zinc-900 dark:text-zinc-100" />
          </Button>
        </div>
      </header>

      {/* Mobile Fullscreen Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] bg-white/95 backdrop-blur-md dark:bg-zinc-950/95 sm:hidden">
          <div className="flex h-16 items-center justify-between px-6">
            <img src={logoMainPng} alt={SITE_NAME} className="h-9 w-auto object-contain" />
            <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(false)} className="rounded-full">
              <X className="h-5 w-5 text-zinc-900 dark:text-zinc-100" />
            </Button>
          </div>
          <motion.nav
            initial="hidden"
            animate="show"
            exit="hidden"
            variants={{
              show: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
              hidden: { opacity: 0 }
            }}
            className="flex flex-col gap-6 p-8"
          >
            <motion.div variants={itemVariant}>
              <Link to="/" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                <Home className="h-6 w-6 text-brand-500" /> Home
              </Link>
            </motion.div>
            <motion.div variants={itemVariant}>
              <Link to="/privacy-policy" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                <Shield className="h-6 w-6 text-brand-500" /> Privacy Policy
              </Link>
            </motion.div>
            <motion.div variants={itemVariant} className="pt-6 border-t border-zinc-200 dark:border-zinc-800">
              <button onClick={() => { toggleTheme(); setMobileMenuOpen(false); }} className="flex w-full items-center gap-3 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {theme === "light" ? <Moon className="h-6 w-6 text-brand-500" /> : <Sun className="h-6 w-6 text-brand-500" />}
                {theme === "light" ? "Dark Mode" : "Light Mode"}
              </button>
            </motion.div>
          </motion.nav>
        </div>
      )}

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-sm">
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400"><Share2 className="h-5 w-5" /></div>
            <div><h2 className="text-lg font-bold">Share Folder</h2><p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Bagikan tautan folder publik ini.</p></div>
            {qrDataUrl ? <img src={qrDataUrl} alt="QR Code" className="mx-auto h-48 w-48 rounded-xl border border-zinc-200 bg-white p-2" /> : null}
            <Button className="w-full gap-2" onClick={copyShareLink}><Copy className="h-4 w-4" /> Copy Link</Button>
          </div>
        </DialogContent>
      </Dialog>

      <main className="relative z-10 pt-24 pb-12 px-6 w-full max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)] items-stretch"
        >
          {/* Sisi Kiri: FolderInfoCard */}
          <aside className="lg:sticky lg:top-24 h-full flex flex-col">
            <div className="flex-1 flex flex-col justify-between rounded-md border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-accent-500/10">
                  <FolderIcon className="h-11 w-11 text-accent-500" fill="currentColor" fillOpacity={0.15} />
                </div>
                <h1 className="mt-4 max-w-full truncate text-xl font-bold" title={rootLabel}>{rootLabel}</h1>
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 dark:border-brand-500/30 dark:bg-brand-900/30 dark:text-brand-300">
                  <Shield className="h-3 w-3" /> Shared folder
                </span>
                <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                  {totalItems} item{totalItems === 1 ? "" : "s"} &middot; Public access
                </p>

                {/* Premium Download Banner */}
                <div className="mt-4 flex items-start gap-3 rounded-md border border-brand-200/50 bg-brand-50/30 p-3 text-left dark:border-brand-500/20 dark:bg-brand-950/20">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
                  <div>
                    <h4 className="text-xs font-bold text-zinc-900 dark:text-white">Premium Active</h4>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                      Unlimited premium access active. Fast downloads without cap or quota.
                    </p>
                  </div>
                </div>

                {/* Security Scan Banner */}
                <div className="mt-3 flex items-start gap-3 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 text-left dark:border-emerald-500/10 dark:bg-emerald-950/5">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <h4 className="text-xs font-bold text-zinc-900 dark:text-white">Secured & Verified</h4>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                      All contents scanned. Protected from malware and security threats.
                    </p>
                  </div>
                </div>

                {/* Cloud Sync Status Banner */}
                <div className="mt-3 flex items-start gap-3 rounded-md border border-sky-500/20 bg-sky-500/5 p-3 text-left dark:border-sky-500/10 dark:bg-sky-950/5">
                  <DownloadCloud className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
                  <div>
                    <h4 className="text-xs font-bold text-zinc-900 dark:text-white">Cloud Sync Active</h4>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                      Files are synced securely with live high-speed cloud download mirrors.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-center dark:border-white/5 dark:bg-zinc-800/40">
                    <p className="text-lg font-bold">{totalItems}</p>
                    <p className="mt-0.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Total Items</p>
                  </div>
                  <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-center dark:border-white/5 dark:bg-zinc-800/40">
                    <p className="text-lg font-bold">{formatBytes(totalSize)}</p>
                    <p className="mt-0.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Total Size</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-2">
                  <Button className="w-full gap-2 rounded-md" onClick={downloadAll} disabled={files.length === 0}>
                    <DownloadCloud className="h-4 w-4" /> Download All
                  </Button>
                  <Button variant="outline" className="w-full gap-2 rounded-md" onClick={() => setShareOpen(true)}>
                    <Share2 className="h-4 w-4" /> Share Folder
                  </Button>
                </div>
              </div>
            </div>
          </aside>

          {/* Sisi Kanan: FileExplorerContainer */}
          <section className="min-w-0 flex flex-col justify-between">
            <div>
              {/* Breadcrumb */}
              <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
                <button type="button" onClick={() => goToPath("")} className="flex items-center gap-1 rounded-md px-1.5 py-1 font-medium hover:text-brand-600 dark:hover:text-brand-400"><Home className="h-3.5 w-3.5" /> {rootLabel}</button>
                {pathSegments.map((segment: string, index: number) => (
                  <span key={`${segment}-${index}`} className="flex items-center gap-1">
                    <ChevronRight className="h-3.5 w-3.5 text-zinc-300 dark:text-zinc-600" />
                    <button type="button" onClick={() => goToPath(pathSegments.slice(0, index + 1).join("/"))} className="max-w-[160px] truncate rounded-md px-1.5 py-1 hover:text-brand-600 dark:hover:text-brand-400">{breadcrumbLabels[index] ?? segment}</button>
                  </span>
                ))}
              </nav>

              {/* Main Explorer Box - Menyatu dalam 1 border kotak solid */}
              <div className="rounded-md border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900 shadow-sm overflow-hidden flex flex-col">
                
                {/* 1. Header Box: Search & View Toggle di dalam border */}
                <div className="flex items-center justify-between gap-3 p-4 border-b border-zinc-200 dark:border-white/10 bg-zinc-50/50 dark:bg-zinc-800/20">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Search in this folder..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-9 w-full rounded-md border border-zinc-200 bg-white pl-10 pr-4 text-xs outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-zinc-900 dark:focus:border-brand-500"
                    />
                  </div>
                  <div className="flex shrink-0 items-center gap-1 rounded-md border border-zinc-200 bg-white p-1 dark:border-white/10 dark:bg-zinc-900">
                    <button type="button" onClick={() => setViewMode("list")} className={`flex h-7 w-7 items-center justify-center rounded-md transition ${viewMode === "list" ? "bg-brand-500 text-white" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`} aria-label="List view"><List className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => setViewMode("grid")} className={`flex h-7 w-7 items-center justify-center rounded-md transition ${viewMode === "grid" ? "bg-brand-500 text-white" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`} aria-label="Grid view"><LayoutGrid className="h-3.5 w-3.5" /></button>
                  </div>
                </div>

                {/* 2. Middle Box: Table/Grid Area */}
                <div className="h-[480px] overflow-y-auto">
                  {viewMode === "list" ? (
                    <div className="w-full overflow-x-hidden border-t border-zinc-200 dark:border-white/10">
                      <table className="w-full text-left text-sm table-fixed border-collapse">
                        <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-400">
                          <tr className="divide-x divide-zinc-200 dark:divide-zinc-800">
                            <th className="px-4 py-3 w-12 text-center font-semibold">#</th>
                            <th className="px-4 py-3 font-semibold w-auto"><button type="button" onClick={() => toggleSort("name")} className="inline-flex items-center gap-1 hover:text-brand-600 dark:hover:text-brand-400">Name {sortKey === "name" ? (sortDir === "asc" ? "\u2191" : "\u2193") : "\u2195"}</button></th>
                            <th className="hidden sm:table-cell px-4 py-3 font-semibold w-24 sm:w-32"><button type="button" onClick={() => toggleSort("size")} className="inline-flex items-center gap-1 hover:text-brand-600 dark:hover:text-brand-400">Size {sortKey === "size" ? (sortDir === "asc" ? "\u2191" : "\u2193") : "\u2195"}</button></th>
                            <th className="hidden sm:table-cell px-4 py-3 font-semibold w-28 sm:w-36"><button type="button" onClick={() => toggleSort("type")} className="inline-flex items-center gap-1 hover:text-brand-600 dark:hover:text-brand-400">Type {sortKey === "type" ? (sortDir === "asc" ? "\u2191" : "\u2193") : "\u2195"}</button></th>
                            <th className="px-4 py-3 w-16 text-center font-semibold">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                          {loading ? (
                            <tr className="divide-x divide-zinc-200 dark:divide-zinc-800">
                              <td colSpan={5} className="h-96 text-center align-middle text-zinc-500 dark:text-zinc-400">
                                <div className="flex items-center justify-center"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading folder...</div>
                              </td>
                            </tr>
                          ) : error ? (
                            <tr className="divide-x divide-zinc-200 dark:divide-zinc-800">
                              <td colSpan={5} className="h-96 text-center align-middle p-6">
                                <div className="flex flex-col items-center justify-center"><FolderIcon className="mb-3 h-12 w-12 text-zinc-300 dark:text-zinc-700" /><h2 className="text-lg font-bold">Folder tidak tersedia</h2><p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{error}</p></div>
                              </td>
                            </tr>
                          ) : !hasItems ? (
                            <tr className="divide-x divide-zinc-200 dark:divide-zinc-800">
                              <td colSpan={5} className="h-96 text-center align-middle p-6">
                                <div className="flex flex-col items-center justify-center"><FolderIcon className="mb-3 h-12 w-12 text-zinc-300 dark:text-zinc-700" /><h2 className="text-lg font-bold">{q ? "Tidak ada hasil" : "Folder kosong"}</h2><p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{q ? "Coba kata kunci lain." : "Tidak ada file atau subfolder."}</p></div>
                              </td>
                            </tr>
                          ) : (
                            (() => {
                              const allItems = [
                                ...filteredSubfolders.map((folder) => ({ type: "folder" as const, id: `folder-${folder.id}`, data: folder })),
                                ...sortedFiles.map((file) => ({ type: "file" as const, id: `file-${file.filename}`, data: file }))
                              ];
                              const startIndex = (page - 1) * pageSize;
                              const paginatedItems = allItems.slice(startIndex, startIndex + pageSize);

                              return paginatedItems.map((item, idx) => {
                                const globalIndex = startIndex + idx + 1;
                                if (item.type === "folder") {
                                  const folder = item.data as Folder;
                                  return (
                                    <tr key={item.id} className="cursor-pointer transition hover:bg-zinc-50 dark:hover:bg-white/5 divide-x divide-zinc-200 dark:divide-zinc-800" onClick={() => openFolder(folder)}>
                                      <td className="px-4 py-3 text-center text-zinc-400 dark:text-zinc-500 font-mono text-xs">{globalIndex}</td>
                                      <td className="px-4 py-3"><div className="flex items-center gap-3"><FolderIcon className="h-5 w-5 shrink-0 text-accent-500" fill="currentColor" fillOpacity={0.15} /><span className="truncate font-medium">{folder.name}</span></div></td>
                                      <td className="hidden sm:table-cell px-4 py-3 text-zinc-500 dark:text-zinc-400">&mdash;</td>
                                      <td className="hidden sm:table-cell px-4 py-3 text-zinc-500 dark:text-zinc-400">Folder</td>
                                      <td className="px-4 py-3 text-center"><ChevronRight className="mx-auto h-4 w-4 text-zinc-400" /></td>
                                    </tr>
                                  );
                                } else {
                                  const file = item.data as PublicFolderFile;
                                  const meta = getFileTypeMeta(file.mimeType, file.filename);
                                  return (
                                    <tr key={item.id} className="transition hover:bg-zinc-50 dark:hover:bg-white/5 divide-x divide-zinc-200 dark:divide-zinc-800">
                                      <td className="px-4 py-3 text-center text-zinc-400 dark:text-zinc-500 font-mono text-xs">{globalIndex}</td>
                                      <td className="px-4 py-3"><div className="flex items-center gap-3"><meta.Icon className={`h-5 w-5 shrink-0 ${meta.color}`} /><span className="truncate font-medium text-zinc-800 dark:text-zinc-200">{file.filename}</span></div></td>
                                      <td className="hidden sm:table-cell px-4 py-3 text-zinc-500 dark:text-zinc-400">{formatBytes(file.sizeBytes)}</td>
                                      <td className="hidden sm:table-cell px-4 py-3 text-zinc-500 dark:text-zinc-400">{meta.label}</td>
                                      <td className="px-4 py-3 text-center">
                                        <a
                                          href={buildDownloadUrl(file)}
                                          download={file.filename}
                                          onContextMenu={(e) => e.preventDefault()}
                                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-brand-600 dark:hover:bg-zinc-800 dark:hover:text-brand-400"
                                          aria-label="Download"
                                        >
                                          <Download className="h-4 w-4" />
                                        </a>
                                      </td>
                                    </tr>
                                  );
                                }
                              });
                            })()
                          )}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    /* Grid View */
                    <div className="p-4">
                      {loading ? (
                        <div className="flex min-h-[320px] items-center justify-center text-zinc-500 dark:text-zinc-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading folder...</div>
                      ) : error ? (
                        <div className="flex min-h-[320px] flex-col items-center justify-center p-6 text-center"><FolderIcon className="mb-3 h-12 w-12 text-zinc-300 dark:text-zinc-700" /><h2 className="text-lg font-bold">Folder tidak tersedia</h2><p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{error}</p></div>
                      ) : !hasItems ? (
                        <div className="flex min-h-[320px] flex-col items-center justify-center p-6 text-center"><FolderIcon className="mb-3 h-12 w-12 text-zinc-300 dark:text-zinc-700" /><h2 className="text-lg font-bold">{q ? "Tidak ada hasil" : "Folder kosong"}</h2><p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{q ? "Coba kata kunci lain." : "Tidak ada file atau subfolder."}</p></div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                          {(() => {
                            const allItems = [
                              ...filteredSubfolders.map((folder) => ({ type: "folder" as const, id: `gfolder-${folder.id}`, data: folder })),
                              ...sortedFiles.map((file) => ({ type: "file" as const, id: `gfile-${file.filename}`, data: file }))
                            ];
                            const startIndex = (page - 1) * pageSize;
                            const paginatedItems = allItems.slice(startIndex, startIndex + pageSize);

                            return paginatedItems.map((item) => {
                              if (item.type === "folder") {
                                const folder = item.data as Folder;
                                return (
                                  <button key={item.id} type="button" onClick={() => openFolder(folder)} className="flex flex-col items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-4 text-center transition hover:border-brand-500 hover:bg-brand-50 dark:border-white/10 dark:bg-zinc-800/40 dark:hover:border-brand-500/40 dark:hover:bg-brand-900/20">
                                    <FolderIcon className="h-10 w-10 text-accent-500" fill="currentColor" fillOpacity={0.15} />
                                    <span className="w-full truncate text-xs font-semibold">{folder.name}</span>
                                  </button>
                                );
                              } else {
                                const file = item.data as PublicFolderFile;
                                const meta = getFileTypeMeta(file.mimeType, file.filename);
                                return (
                                  <a key={item.id} href={buildDownloadUrl(file)} onContextMenu={(e) => e.preventDefault()} className="flex flex-col items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-4 text-center transition hover:border-brand-500 hover:bg-brand-50 dark:border-white/10 dark:bg-zinc-800/40 dark:hover:border-brand-500/40 dark:hover:bg-brand-900/20">
                                    <meta.Icon className={`h-10 w-10 ${meta.color}`} />
                                    <span className="w-full truncate text-xs font-semibold">{file.filename}</span>
                                    <span className="text-[10px] text-zinc-500">{formatBytes(file.sizeBytes)}</span>
                                  </a>
                                );
                              }
                            });
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>                {/* 3. Footer Box: Pagination di dalam border */}
                {hasItems && (
                  <div className="flex flex-col gap-3 px-4 py-3 border-t border-zinc-200 dark:border-white/10 bg-zinc-50/50 dark:bg-zinc-800/20 sm:flex-row sm:items-center sm:justify-between text-xs sm:text-sm">
                    <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                      <span>Show</span>
                      <select
                        value={pageSize}
                        onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                        className="h-8 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 text-xs outline-none focus:border-brand-500"
                      >
                        {[10, 20, 50].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <span>per page</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs text-zinc-400">
                        {(() => {
                          const total = filteredSubfolders.length + filteredFiles.length;
                          const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
                          const to = Math.min(page * pageSize, total);
                          return `Showing ${from}-${to} of ${total} items`;
                        })()}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-md border border-zinc-250 dark:border-zinc-700 disabled:opacity-50"
                          onClick={() => setPage(1)}
                          disabled={page === 1}
                        >
                          <ChevronsLeft className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-md border border-zinc-250 dark:border-zinc-700 disabled:opacity-50"
                          onClick={() => setPage(page - 1)}
                          disabled={page === 1}
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        <span className="text-xs font-semibold text-zinc-750 dark:text-zinc-350 px-2">
                          {page} / {Math.max(1, Math.ceil((filteredSubfolders.length + filteredFiles.length) / pageSize))}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-md border border-zinc-250 dark:border-zinc-700 disabled:opacity-50"
                          onClick={() => setPage(page + 1)}
                          disabled={page >= Math.ceil((filteredSubfolders.length + filteredFiles.length) / pageSize)}
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-md border border-zinc-250 dark:border-zinc-700 disabled:opacity-50"
                          onClick={() => setPage(Math.ceil((filteredSubfolders.length + filteredFiles.length) / pageSize))}
                          disabled={page >= Math.ceil((filteredSubfolders.length + filteredFiles.length) / pageSize)}
                        >
                          <ChevronsRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 mt-6 border-t border-zinc-200/70 bg-white/50 py-8 backdrop-blur dark:border-white/10 dark:bg-zinc-950/50">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-6 text-center">
          <img src={logoMainPng} alt={SITE_NAME} className="h-8 w-auto object-contain" />
          <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            Protected by {SITE_NAME}
          </p>
          <p className="flex flex-wrap items-center justify-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
            <span>Folder Acces Public Premium</span>
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            &copy; {new Date().getFullYear()} {SITE_NAME}. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
