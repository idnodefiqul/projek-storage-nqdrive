import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import {
  ChevronRight, Download, FileArchive, FileAudio, FileCode,
  File as FileIcon, FileImage, FileSpreadsheet, FileText, FileVideo, Folder as FolderIcon,
  Home, Loader2, Search, Share2, ShieldCheck, X,
  HardDrive, FolderOpen, Flag, MessageCircle, Send, Mail, Link2,
} from "lucide-react";
import { motion } from "framer-motion";
import QRCode from "qrcode";
import { Dialog, GridPattern } from "@nqdrive/ui";
import { formatBytes, slugifyFilename } from "@nqdrive/shared";
import type { Folder } from "@nqdrive/types";
import { useTheme } from "../stores/theme-provider";
import { logoMainPng } from "../assets";

const searchSchema = z.object({
  path: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/folder/$shareUuid/$folderName")({
  validateSearch: searchSchema,
  component: PublicFolderPage,
});

function getFolderId(f: { folderId?: string | null } | null | undefined): string {
  return f?.folderId ?? "";
}

const SITE_NAME = (import.meta.env?.VITE_SITE_NAME as string) || "NQDRIVE";
const WORKER_BASE = (import.meta.env?.VITE_WORKER_URL as string | undefined) ?? "";

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

interface FileTypeMeta {
  Icon: typeof FileIcon;
  color: string;
  label: string;
}

function getFileTypeMeta(mime: string, filename: string): FileTypeMeta {
  const ext = filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();
  const m = mime.toLowerCase();

  if (["zip", "rar", "tar", "gz", "7z"].includes(ext) || m.includes("zip") || m.includes("compressed"))
    return { Icon: FileArchive, color: "text-blue-400", label: "Archive" };
  if (ext === "pdf" || m.includes("pdf"))
    return { Icon: FileText, color: "text-red-400", label: "PDF" };
  if (["xlsx", "xls", "csv"].includes(ext) || m.includes("spreadsheet") || m.includes("excel"))
    return { Icon: FileSpreadsheet, color: "text-emerald-400", label: "Spreadsheet" };
  if (["pptx", "ppt"].includes(ext) || m.includes("presentation") || m.includes("powerpoint"))
    return { Icon: FileText, color: "text-amber-400", label: "Presentation" };
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext) || m.includes("image"))
    return { Icon: FileImage, color: "text-emerald-400", label: "Image" };
  if (["doc", "docx"].includes(ext) || m.includes("word") || m.includes("document"))
    return { Icon: FileText, color: "text-sky-400", label: "Document" };
  if (m.includes("audio") || ["mp3", "wav", "flac", "ogg", "m4a"].includes(ext))
    return { Icon: FileAudio, color: "text-violet-400", label: "Audio" };
  if (m.includes("video") || ["mp4", "mkv", "mov", "webm", "avi"].includes(ext))
    return { Icon: FileVideo, color: "text-rose-400", label: "Video" };
  if (["js", "ts", "json", "html", "css", "tsx", "jsx"].includes(ext) || m.includes("code") || m.includes("text/plain"))
    return { Icon: FileCode, color: "text-amber-400", label: "Code" };

  const sub = mime.split("/")[1];
  return { Icon: FileIcon, color: "text-zinc-400", label: sub ? sub.toUpperCase() : "File" };
}

function PublicFolderPage() {
  const { shareUuid, folderName } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { theme } = useTheme();

  const [currentPath, setCurrentPath] = useState(search.path ?? "");
  const [subfolders, setSubfolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<PublicFolderFile[]>([]);
  const [breadcrumbLabels, setBreadcrumbLabels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const pageSize = 10;

  const rootLabel = useMemo(() => decodeURIComponent(folderName), [folderName]);

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
    QRCode.toDataURL(window.location.href, { width: 220, margin: 2 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [shareOpen]);

  useEffect(() => { setPage(1); }, [searchQuery]);

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

  const q = searchQuery.trim().toLowerCase();
  const filteredSubfolders = q ? subfolders.filter((f) => f.name.toLowerCase().includes(q)) : subfolders;
  const filteredFiles = q ? files.filter((f) => f.filename.toLowerCase().includes(q)) : files;
  const sortedFiles = useMemo(() => {
    const copy = [...filteredFiles];
    copy.sort((a, b) => a.filename.localeCompare(b.filename));
    return copy;
  }, [filteredFiles]);

  const totalItems = filteredSubfolders.length + filteredFiles.length;
  const totalSize = filteredFiles.reduce((sum, f) => sum + f.sizeBytes, 0);
  const hasItems = filteredSubfolders.length > 0 || filteredFiles.length > 0;

  const allEntries = [
    ...filteredSubfolders.map((folder) => ({ type: "folder" as const, id: `f-${getFolderId(folder)}`, data: folder })),
    ...sortedFiles.map((file) => ({ type: "file" as const, id: `d-${file.filename}`, data: file })),
  ];
  const startIndex = (page - 1) * pageSize;
  const paginatedEntries = allEntries.slice(startIndex, startIndex + pageSize);
  const totalPages = Math.max(1, Math.ceil(allEntries.length / pageSize));

  const copyShareLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    alert("Tautan berhasil disalin!");
  };

  const triggerDownloadAnimation = (key: string) => {
    setDownloadingKey(key);
    setTimeout(() => setDownloadingKey((current) => (current === key ? null : current)), 2000);
  };
  const downloadSingleFile = (file: PublicFolderFile, key: string) => {
    triggerDownloadAnimation(key);
    const a = document.createElement("a");
    a.href = buildDownloadUrl(file);
    a.download = file.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const encodedShareUrl = encodeURIComponent(shareUrl);
  const encodedShareText = encodeURIComponent(`Folder "${rootLabel}" — ${SITE_NAME}`);

  return (
    <>
      <style>{`
        @keyframes soft-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(59,130,246,0.4); }
          70%  { box-shadow: 0 0 0 15px rgba(59,130,246,0); }
          100% { box-shadow: 0 0 0 0 rgba(59,130,246,0); }
        }
        .icon-pulse { animation: soft-pulse 2.5s infinite; }
      `}</style>

      <div className="relative min-h-screen flex items-center justify-center p-4 sm:p-6 md:p-8 bg-slate-100 dark:bg-zinc-950 font-sans text-slate-900 dark:text-slate-100 overflow-hidden">
        <GridPattern
          width={30} height={30}
          className="[mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)] text-slate-300 dark:text-zinc-700"
          strokeDasharray="2 2"
        />

        {loading ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
            <p className="text-sm font-medium text-slate-500 animate-pulse">Memuat folder...</p>
          </div>
        ) : error ? (
          <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-md p-8 text-center shadow-xl">
            <FolderOpen className="mx-auto h-12 w-12 text-zinc-300 dark:text-zinc-600 mb-3" />
            <h1 className="text-2xl font-bold mb-2">Folder Tidak Ditemukan</h1>
            <p className="text-slate-500 mb-6">{error}</p>
            <Link to="/" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-semibold transition-all">
              <Home className="h-5 w-5" /> Kembali ke Beranda
            </Link>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-5xl w-full bg-white dark:bg-zinc-900 rounded-md overflow-hidden shadow-[0_20px_50px_rgba(8,112,184,0.07)] dark:shadow-none dark:border dark:border-zinc-800 flex flex-col md:flex-row relative"
          >
            {/* ── Panel Kiri — Identitas Folder ── */}
            <div
              className="w-full md:w-5/12 p-6 sm:p-8 md:p-10 flex flex-col items-center justify-center relative min-h-[200px] md:min-h-[340px]"
              style={{
                backgroundColor: "#0f172a",
                backgroundImage: "radial-gradient(rgba(255,255,255,0.1) 1px, transparent 1px)",
                backgroundSize: "20px 20px",
              }}
            >
              <Link to="/" className="absolute top-4 left-4 md:top-6 md:left-6 transition-opacity hover:opacity-80">
                <img src={logoMainPng} alt={SITE_NAME} className="h-5 md:h-7 w-auto object-contain brightness-0 invert" />
              </Link>

              <div className="w-20 h-20 md:w-28 md:h-28 rounded-md bg-slate-800 border-2 border-slate-700 flex items-center justify-center mb-4 md:mb-6 icon-pulse z-10 relative mt-6 md:mt-0">
                <FolderIcon className="h-10 w-10 md:h-14 md:w-14 text-blue-400" fill="currentColor" fillOpacity={0.08} />
                <div className="absolute -bottom-2 -right-2 bg-blue-600 text-white text-[10px] md:text-xs font-bold px-2 py-1 md:px-3 md:py-1.5 rounded-sm shadow-lg">
                  Folder
                </div>
              </div>

              <h2 className="text-lg md:text-2xl text-white font-bold text-center z-10 mb-2 leading-tight break-all line-clamp-3">
                {rootLabel}
              </h2>

              <div className="bg-slate-800/80 backdrop-blur-sm text-slate-300 text-xs md:text-sm font-medium px-3 py-1.5 md:px-4 md:py-2 rounded-sm z-10 mt-1 md:mt-2 border border-slate-700 flex items-center gap-2">
                <HardDrive className="h-3.5 w-3.5" /> {totalItems} item &middot; {formatBytes(totalSize)}
              </div>
            </div>

            {/* ── Panel Kanan — Konten & Aksi ── */}
            <div className="w-full md:w-7/12 p-5 sm:p-8 md:p-10 flex flex-col">
              {/* Search + breadcrumb */}
              <div className="flex items-center gap-3 mb-4 md:mb-6">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari file atau folder..."
                    className="w-full h-10 md:h-11 rounded-md border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/50 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                  />
                </div>
                <span className="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 text-[10px] md:text-xs font-bold px-2.5 py-2 md:px-3 rounded-md border border-emerald-100 dark:border-emerald-500/20 flex items-center gap-1.5 shrink-0">
                  <ShieldCheck className="h-3.5 w-3.5 md:h-4 md:w-4" /> Aman
                </span>
              </div>

              {pathSegments.length > 0 && (
                <nav className="mb-4 flex flex-wrap items-center gap-1 text-xs text-[rgb(var(--ink-500))]">
                  <button type="button" onClick={() => goToPath("")} className="flex items-center gap-1 rounded-full px-2 py-1 font-medium hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-zinc-800 dark:hover:text-blue-400">
                    <Home className="h-3 w-3" /> {rootLabel}
                  </button>
                  {pathSegments.map((segment, index) => (
                    <span key={`${segment}-${index}`} className="flex items-center gap-1">
                      <ChevronRight className="h-3 w-3 text-slate-300 dark:text-zinc-600" />
                      <button type="button" onClick={() => goToPath(pathSegments.slice(0, index + 1).join("/"))} className="max-w-[140px] truncate rounded-full px-2 py-1 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-zinc-800 dark:hover:text-blue-400">
                        {breadcrumbLabels[index] ?? segment}
                      </button>
                    </span>
                  ))}
                </nav>
              )}

              {/* Info box */}
              <div className="my-4 md:my-5 bg-slate-50 dark:bg-zinc-800/50 rounded-md p-4 md:p-5 border border-slate-100 dark:border-zinc-800">
                <div className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-zinc-700">
                  <span className="text-slate-500 dark:text-slate-400 text-xs md:text-sm flex items-center"><FolderOpen className="h-4 w-4 mr-2" />Total Item</span>
                  <span className="text-slate-800 dark:text-slate-200 font-semibold text-xs md:text-sm">{totalItems}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-zinc-700 mt-1">
                  <span className="text-slate-500 dark:text-slate-400 text-xs md:text-sm flex items-center"><FileText className="h-4 w-4 mr-2" />File</span>
                  <span className="text-slate-800 dark:text-slate-200 font-semibold text-xs md:text-sm">{filteredFiles.length}</span>
                </div>
                <div className="flex justify-between items-center py-2 mt-1">
                  <span className="text-slate-500 dark:text-slate-400 text-xs md:text-sm flex items-center"><HardDrive className="h-4 w-4 mr-2" />Total Ukuran</span>
                  <span className="text-slate-800 dark:text-slate-200 font-semibold text-xs md:text-sm">{formatBytes(totalSize)}</span>
                </div>
              </div>

              {/* File/folder list */}
              <div className="min-h-[200px] flex-grow max-h-[45vh] overflow-y-auto pr-1">
                {!hasItems ? (
                  <div className="flex min-h-[200px] flex-col items-center justify-center p-6 text-center">
                    <FolderIcon className="mb-3 h-10 w-10 text-slate-300 dark:text-zinc-600" />
                    <h2 className="text-base font-bold">{q ? "Tidak ada hasil" : "Folder kosong"}</h2>
                    <p className="mt-1 text-xs text-slate-500">{q ? "Coba kata kunci lain." : "Tidak ada file atau subfolder."}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {paginatedEntries.map((item) => {
                      if (item.type === "folder") {
                        const folder = item.data as Folder;
                        return (
                          <div
                            key={item.id}
                            onClick={() => openFolder(folder)}
                            className="group flex min-w-0 cursor-pointer items-center justify-between gap-3 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 md:p-3.5 transition hover:border-blue-400 dark:hover:border-blue-500/50"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-zinc-800">
                                <FolderIcon className="h-5 w-5 text-blue-500" fill="currentColor" fillOpacity={0.08} />
                              </div>
                              <div className="min-w-0">
                                <h4 className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{folder.name}</h4>
                                <p className="text-[11px] text-slate-400">Folder</p>
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-blue-500 dark:text-zinc-600" />
                          </div>
                        );
                      }
                      const file = item.data as PublicFolderFile;
                      const meta = getFileTypeMeta(file.mimeType, file.filename);
                      const isDownloading = downloadingKey === item.id;
                      return (
                        <div
                          key={item.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => downloadSingleFile(file, item.id)}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); downloadSingleFile(file, item.id); } }}
                          className="group flex min-w-0 cursor-pointer items-center justify-between gap-3 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 md:p-3.5 transition hover:border-blue-400 dark:hover:border-blue-500/50"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-zinc-800 ${meta.color}`}>
                              <meta.Icon className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                              <h4 className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{file.filename}</h4>
                              <p className="text-[11px] text-slate-400">{meta.label} &middot; {formatBytes(file.sizeBytes)}</p>
                            </div>
                          </div>
                          {isDownloading ? (
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500" />
                          ) : (
                            <Download className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-blue-500 dark:text-zinc-600" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Pagination */}
              {hasItems && totalPages > 1 && (
                <div className="mt-4 flex items-center justify-center gap-3">
                  <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium transition hover:bg-blue-500 hover:text-white disabled:pointer-events-none disabled:opacity-40 dark:bg-zinc-800">
                    Prev
                  </button>
                  <span className="text-xs font-bold text-slate-500">{page} / {totalPages}</span>
                  <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium transition hover:bg-blue-500 hover:text-white disabled:pointer-events-none disabled:opacity-40 dark:bg-zinc-800">
                    Next
                  </button>
                </div>
              )}

              {/* Action buttons */}
              <div className="mt-auto pt-5 flex flex-col gap-3">
                <div className="flex gap-2 md:gap-3">
                  <button
                    onClick={() => setShareOpen(true)}
                    className="flex-1 bg-white dark:bg-zinc-900 border-2 border-slate-100 dark:border-zinc-800 hover:border-slate-200 dark:hover:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-slate-300 h-11 md:h-12 rounded-md font-semibold transition-all flex items-center justify-center gap-2 text-xs md:text-sm"
                  >
                    <Share2 className="h-4 w-4" /> Bagikan Folder
                  </button>
                  <button onClick={() => alert("Laporan diterima.")} className="flex-none bg-white dark:bg-zinc-900 border-2 border-slate-100 dark:border-zinc-800 hover:border-red-100 hover:bg-red-50 hover:text-red-600 text-slate-500 h-11 md:h-12 px-4 md:px-5 rounded-md transition-all flex items-center justify-center">
                    <Flag className="h-4 w-4 md:h-5 md:w-5" />
                  </button>
                </div>

                <footer className="flex items-center justify-center gap-1.5 pt-3 text-xs text-slate-400 dark:text-zinc-500">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                  Protected by {SITE_NAME}
                </footer>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* ── Share Modal (sama dengan halaman download file) ── */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen} className="max-w-md p-0 overflow-hidden rounded-md">
        <div className="bg-white dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-100 p-4 dark:border-zinc-800/60">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">Bagikan Folder</h3>
            <button onClick={() => setShareOpen(false)} className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-6">
            <div className="mb-6 flex flex-col items-center justify-center gap-3">
              {qrDataUrl ? (
                <div className="rounded-md bg-white p-3 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
                  <img src={qrDataUrl} alt="QR Code" className="h-40 w-40 rounded-sm" />
                </div>
              ) : (
                <div className="h-40 w-40 rounded-md bg-zinc-100 animate-pulse dark:bg-zinc-800" />
              )}
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Scan QR Code untuk membuka</p>
            </div>

            <div className="mb-6 grid grid-cols-4 gap-3">
              <a href={`https://wa.me/?text=${encodedShareText}%0A${encodedShareUrl}`} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1.5 transition-transform hover:scale-105">
                <div className="flex h-12 w-12 items-center justify-center rounded-md bg-[#25D366]/10 text-[#25D366]">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-400">WhatsApp</span>
              </a>
              <a href={`https://t.me/share/url?url=${encodedShareUrl}&text=${encodedShareText}`} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1.5 transition-transform hover:scale-105">
                <div className="flex h-12 w-12 items-center justify-center rounded-md bg-[#0088cc]/10 text-[#0088cc]">
                  <Send className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-400">Telegram</span>
              </a>
              <a href={`https://twitter.com/intent/tweet?url=${encodedShareUrl}&text=${encodedShareText}`} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1.5 transition-transform hover:scale-105">
                <div className="flex h-12 w-12 items-center justify-center rounded-md bg-zinc-900/5 text-zinc-900 dark:bg-white/10 dark:text-white">
                  <X className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-400">X / Twitter</span>
              </a>
              <a href={`mailto:?subject=${encodedShareText}&body=${encodedShareUrl}`} className="flex flex-col items-center gap-1.5 transition-transform hover:scale-105">
                <div className="flex h-12 w-12 items-center justify-center rounded-md bg-red-500/10 text-red-500">
                  <Mail className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-400">Email</span>
              </a>
            </div>

            <div className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-1.5 pr-2 dark:border-zinc-800 dark:bg-zinc-900/50">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-white text-zinc-400 shadow-sm dark:bg-zinc-800">
                <Link2 className="h-4 w-4" />
              </div>
              <input type="text" readOnly value={shareUrl} className="min-w-0 flex-1 bg-transparent px-2 text-xs text-zinc-600 outline-none dark:text-zinc-300" />
              <button onClick={copyShareLink} className="h-8 shrink-0 rounded-sm px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors">
                Copy
              </button>
            </div>
          </div>
        </div>
      </Dialog>
    </>
  );
}

export default PublicFolderPage;
