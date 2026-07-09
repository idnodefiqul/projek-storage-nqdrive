import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { z } from "zod";
import {
  ChevronRight, Copy, Download, FileArchive, FileAudio, FileCode,
  File as FileIcon, FileImage, FileSpreadsheet, FileText, FileVideo, Folder as FolderIcon,
  Home, Loader2, Menu, Moon, Presentation, Search, Share2, Shield, ShieldCheck, Sun, X,
} from "lucide-react";
import { motion } from "framer-motion";
import QRCode from "qrcode";
import { Button, Dialog, DialogContent, Particles, AnimatedThemeToggle, GridPatternBackground } from "@nqdrive/ui";
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

const SITE_NAME = (import.meta.env?.VITE_SITE_NAME as string) || "FQDrive";
const WORKER_BASE = (import.meta.env?.VITE_WORKER_URL as string | undefined) ?? "";

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
    return { Icon: FileArchive, color: "text-orange-500", label: "Archive" };
  if (ext === "pdf" || m.includes("pdf"))
    return { Icon: FileText, color: "text-red-500", label: "PDF" };
  if (["xlsx", "xls", "csv"].includes(ext) || m.includes("spreadsheet") || m.includes("excel"))
    return { Icon: FileSpreadsheet, color: "text-green-500", label: "Spreadsheet" };
  if (["pptx", "ppt"].includes(ext) || m.includes("presentation") || m.includes("powerpoint"))
    return { Icon: Presentation, color: "text-orange-500", label: "Presentation" };
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext) || m.includes("image"))
    return { Icon: FileImage, color: "text-emerald-500", label: "Image" };
  if (["doc", "docx"].includes(ext) || m.includes("word") || m.includes("document"))
    return { Icon: FileText, color: "text-sky-500", label: "Document" };
  if (m.includes("audio") || ["mp3", "wav", "flac", "ogg", "m4a"].includes(ext))
    return { Icon: FileAudio, color: "text-violet-500", label: "Audio" };
  if (m.includes("video") || ["mp4", "mkv", "mov", "webm", "avi"].includes(ext))
    return { Icon: FileVideo, color: "text-blue-500", label: "Video" };
  if (["js", "ts", "json", "html", "css", "tsx", "jsx"].includes(ext) || m.includes("code") || m.includes("text/plain"))
    return { Icon: FileCode, color: "text-amber-500", label: "Code" };

  const sub = mime.split("/")[1];
  return { Icon: FileIcon, color: "text-zinc-500 dark:text-zinc-400", label: sub ? sub.toUpperCase() : "File" };
}

const itemVariant = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

interface SocialShareTarget {
  name: string;
  color: string;
  buildUrl: (shareUrl: string, text: string) => string;
  Icon: (props: { className?: string }) => ReactElement;
}

const socialShareTargets: SocialShareTarget[] = [
  {
    name: "WhatsApp",
    color: "bg-[#25D366]",
    buildUrl: (url, text) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
    Icon: ({ className }) => (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.92 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2m0 1.67c2.2 0 4.26.86 5.82 2.42a8.19 8.19 0 0 1 2.41 5.82c0 4.54-3.7 8.24-8.25 8.24a8.2 8.2 0 0 1-4.18-1.15l-.3-.17-3.12.82.83-3.04-.19-.31a8.18 8.18 0 0 1-1.26-4.37c0-4.55 3.7-8.26 8.24-8.26M8.53 7.33c-.16 0-.43.06-.66.31-.22.25-.86.84-.86 2.05s.89 2.38 1.01 2.54c.12.17 1.75 2.67 4.26 3.73.6.26 1.06.41 1.42.53.6.19 1.14.16 1.57.1.48-.07 1.47-.6 1.68-1.18s.21-1.07.15-1.18c-.07-.1-.24-.16-.5-.29-.27-.13-1.57-.77-1.81-.86-.24-.09-.42-.13-.6.14-.17.26-.68.86-.83 1.03-.15.18-.31.2-.57.07-.27-.13-1.12-.42-2.14-1.34a8.06 8.06 0 0 1-1.5-1.86c-.15-.26-.02-.4.12-.53.12-.12.27-.32.4-.48.14-.16.18-.27.27-.45.09-.19.05-.35-.02-.48-.07-.13-.6-1.51-.85-2.06-.21-.48-.43-.44-.6-.44l-.45-.02Z"/>
      </svg>
    ),
  },
  {
    name: "Telegram",
    color: "bg-[#26A5E4]",
    buildUrl: (url, text) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    Icon: ({ className }) => (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M21.94 4.6c.27-1.13-.9-2.03-1.94-1.6L2.4 10.44c-1.1.45-1.09 2 .02 2.43l4.28 1.66 1.66 5.29c.24.77 1.22.99 1.78.4l2.36-2.49 4.4 3.27c.85.63 2.07.18 2.3-.85l3.74-15.55Zm-3.7 2.28-9.2 8.02c-.14.12-.22.28-.24.46l-.4 3.16-1.5-4.79a.6.6 0 0 1 .3-.71l10.5-6.5c.24-.15.5.16.3.34Z"/>
      </svg>
    ),
  },
  {
    name: "Facebook",
    color: "bg-[#1877F2]",
    buildUrl: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    Icon: ({ className }) => (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.87h2.78l-.44 2.9h-2.34V22c4.78-.79 8.44-4.94 8.44-9.94Z"/>
      </svg>
    ),
  },
  {
    name: "X",
    color: "bg-zinc-900 dark:bg-zinc-700",
    buildUrl: (url, text) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    Icon: ({ className }) => (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M18.24 2.75h3.3l-7.2 8.23 8.47 11.27h-6.63l-5.2-6.8-5.94 6.8H1.72l7.7-8.8L1.3 2.75h6.8l4.7 6.22 5.44-6.22Zm-1.16 17.5h1.83L7.02 4.63H5.06l12.02 15.62Z"/>
      </svg>
    ),
  },
];

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
  const [searchSidebarOpen, setSearchSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const sortKey: SortKey = "name";
  const sortDir: SortDir = "asc";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

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
    (QRCode as any).toDataURL(window.location.href, { width: 240, margin: 2 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
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

  const totalItems = subfolders.length + files.length;
  const totalSize = files.reduce((sum, f) => sum + f.sizeBytes, 0);
  const hasItems = filteredSubfolders.length > 0 || filteredFiles.length > 0;

  const copyShareLink = () => navigator.clipboard.writeText(window.location.href);

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

  const allEntries = [
    ...filteredSubfolders.map((folder) => ({ type: "folder" as const, id: `entry-folder-${folder.id}`, data: folder })),
    ...sortedFiles.map((file) => ({ type: "file" as const, id: `entry-file-${file.filename}`, data: file })),
  ];
  const startIndex = (page - 1) * pageSize;
  const paginatedEntries = allEntries.slice(startIndex, startIndex + pageSize);
  const totalPages = Math.max(1, Math.ceil(allEntries.length / pageSize));

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50 font-sans selection:bg-brand-500/30 md:h-screen md:flex-row">
      <GridPatternBackground />

      {/* Panel Branding Kiri */}
      <div className="relative h-[35vh] shrink-0 md:sticky md:top-0 md:h-screen md:w-5/12 lg:w-1/2">
        <div className="absolute inset-0 h-full w-full bg-gradient-to-br from-brand-400 via-brand-600 to-brand-900 dark:to-black">
          <div
            className="absolute inset-0 opacity-20"
            style={{ backgroundImage: "radial-gradient(#ffffff 1.5px, transparent 1.5px)", backgroundSize: "24px 24px" }}
          />
          <Particles className="absolute inset-0 opacity-30" quantity={24} />
        </div>

        <div className="absolute inset-0 flex flex-col justify-between bg-black/10 p-8 md:p-12 lg:p-16">
          <div className="flex items-center justify-between">
            <Link to="/" className="hidden items-center transition-opacity hover:opacity-80 md:inline-flex" aria-label="Home">
              <img src={logoMainPng} alt={SITE_NAME} className="h-8 w-auto object-contain brightness-0 invert md:h-12" />
            </Link>
            <div className="ml-auto flex items-center gap-1.5">
              <AnimatedThemeToggle theme={theme} onToggle={toggleTheme} className="hidden h-9 w-9 border-white/20 bg-white/10 text-white hover:bg-white/20 md:inline-flex" />
              <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(true)} className="rounded-full text-white hover:bg-white/15 hover:text-white md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <div>
            <span className="mb-4 inline-flex max-w-full items-center gap-1.5 truncate rounded-full border border-white/20 bg-black/30 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-white backdrop-blur-md" title={rootLabel}>
              {rootLabel}
            </span>
            <h1 className="font-sans text-4xl font-extrabold uppercase leading-tight text-white drop-shadow-lg md:text-5xl lg:text-6xl">
              Folder Sharing<br />Public
            </h1>
            <p className="mt-3 text-sm font-medium text-white/80">
              {totalItems} item{totalItems === 1 ? "" : "s"} &middot; {formatBytes(totalSize)} &middot; Public access
            </p>

            <nav className="mt-6 hidden items-center gap-4 md:flex">
              <Link to="/" className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/80 transition hover:text-white">
                <Home className="h-3.5 w-3.5" /> Home
              </Link>
              <Link to="/privacy-policy" className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/80 transition hover:text-white">
                <Shield className="h-3.5 w-3.5" /> Privacy Policy
              </Link>
            </nav>
          </div>
        </div>
      </div>

      {/* Menu Mobile */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] bg-white/95 backdrop-blur-md dark:bg-zinc-950/95 md:hidden">
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
            <div className="flex justify-center gap-3">
              {socialShareTargets.map((target) => (
                <a
                  key={target.name}
                  href={target.buildUrl(typeof window !== "undefined" ? window.location.href : "", `Lihat folder "${rootLabel}"`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Share via ${target.name}`}
                  className={`flex h-11 w-11 items-center justify-center rounded-full text-white transition hover:opacity-90 ${target.color}`}
                >
                  <target.Icon className="h-5 w-5" />
                </a>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="text" readOnly value={typeof window !== "undefined" ? window.location.href : ""} className="h-10 w-full truncate rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-xs outline-none dark:border-white/10 dark:bg-zinc-800" />
              <Button size="icon" className="h-10 w-10 shrink-0" onClick={copyShareLink} aria-label="Copy link"><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sidebar Pencarian */}
      <div className={`fixed inset-0 z-50 transform transition-transform duration-300 ease-in-out ${searchSidebarOpen ? "translate-x-0" : "translate-x-full"}`}>
        <div onClick={() => setSearchSidebarOpen(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <div className="absolute right-0 top-0 h-full w-full bg-white p-8 shadow-2xl dark:bg-zinc-900 md:w-96">
          <div className="mb-8 flex items-center justify-between">
            <h2 className="text-2xl font-bold">Pencarian</h2>
            <button onClick={() => setSearchSidebarOpen(false)} className="text-xl text-zinc-400 hover:text-zinc-900 dark:hover:text-white"><X className="h-5 w-5" /></button>
          </div>
          <input
            type="text"
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Ketik nama file..."
            className="w-full rounded-xl border-2 border-zinc-100 bg-zinc-50 px-4 py-3 text-lg outline-none transition focus:border-brand-500 dark:border-white/10 dark:bg-zinc-800"
          />
        </div>
      </div>

      <div className="flex w-full flex-col overflow-y-auto overflow-x-hidden p-6 md:h-screen md:w-7/12 md:p-12 lg:w-1/2 lg:p-16 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <div className="mx-auto flex w-full max-w-2xl flex-col min-h-full">

          <div className="mb-8 flex items-center justify-between gap-4 border-b border-zinc-100 pb-8 dark:border-white/10">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-brand-100 bg-brand-50 text-brand-600 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-400">
                <FolderIcon className="h-5 w-5" fill="currentColor" fillOpacity={0.15} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
                  Shared by <span className="font-bold text-zinc-900 dark:text-zinc-100">{SITE_NAME}</span>
                </p>
                <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                  Total <span>{filteredFiles.length + filteredSubfolders.length}</span> item{(filteredFiles.length + filteredSubfolders.length) === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSearchSidebarOpen(true)}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-100 transition hover:bg-brand-500 hover:text-white dark:bg-zinc-800"
              aria-label="Search"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>

          {pathSegments.length > 0 && (
            <nav className="mb-4 flex flex-wrap items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
              <button type="button" onClick={() => goToPath("")} className="flex items-center gap-1 rounded-full px-2 py-1 font-medium hover:bg-zinc-100 hover:text-brand-600 dark:hover:bg-zinc-800 dark:hover:text-brand-400"><Home className="h-3 w-3" /> {rootLabel}</button>
              {pathSegments.map((segment: string, index: number) => (
                <span key={`${segment}-${index}`} className="flex items-center gap-1">
                  <ChevronRight className="h-3 w-3 text-zinc-300 dark:text-zinc-600" />
                  <button type="button" onClick={() => goToPath(pathSegments.slice(0, index + 1).join("/"))} className="max-w-[140px] truncate rounded-full px-2 py-1 hover:bg-zinc-100 hover:text-brand-600 dark:hover:bg-zinc-800 dark:hover:text-brand-400">{breadcrumbLabels[index] ?? segment}</button>
                </span>
              ))}
            </nav>
          )}

          <div className="mb-6 flex gap-4">
            <div className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-4 text-center text-sm text-zinc-500 dark:border-white/10 dark:bg-zinc-800/40 dark:text-zinc-400">
              <Download className="h-4 w-4 shrink-0" />
              <span>Ketuk file untuk mengunduh satu per satu</span>
            </div>
            <button
              type="button"
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-500 py-4 font-bold text-white shadow-lg transition hover:bg-brand-600"
              onClick={() => setShareOpen(true)}
            >
              <Share2 className="h-5 w-5" /> 
              <span>Share</span>
            </button>
          </div>

          <div className="min-h-[300px] flex-grow">
            {loading ? (
              <div className="flex min-h-[300px] items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading folder...
              </div>
            ) : error ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center p-6 text-center">
                <FolderIcon className="mb-3 h-12 w-12 text-zinc-300 dark:text-zinc-700" />
                <h2 className="text-lg font-bold">Folder tidak tersedia</h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{error}</p>
              </div>
            ) : !hasItems ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center p-6 text-center">
                <FolderIcon className="mb-3 h-12 w-12 text-zinc-300 dark:text-zinc-700" />
                <h2 className="text-lg font-bold">{q ? "Tidak ada hasil" : "Folder kosong"}</h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{q ? "Coba kata kunci lain." : "Tidak ada file atau subfolder."}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {paginatedEntries.map((item) => {
                  if (item.type === "folder") {
                    const folder = item.data as Folder;
                    return (
                      <div
                        key={item.id}
                        onClick={() => openFolder(folder)}
                        className="group flex min-w-0 cursor-pointer items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-brand-400 dark:border-white/10 dark:bg-zinc-900 dark:hover:border-brand-500/50"
                      >
                        <div className="flex min-w-0 items-center gap-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-zinc-50 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                            <FolderIcon className="h-5 w-5" fill="currentColor" fillOpacity={0.15} />
                          </div>
                          <div className="min-w-0">
                            <h4 className="truncate text-sm font-bold text-zinc-800 dark:text-zinc-100">{folder.name}</h4>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">Folder</p>
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 shrink-0 text-zinc-300 transition group-hover:text-brand-500 dark:text-zinc-600" />
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
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          downloadSingleFile(file, item.id);
                        }
                      }}
                      onContextMenu={(e) => e.preventDefault()}
                      className="group flex min-w-0 cursor-pointer items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-brand-400 dark:border-white/10 dark:bg-zinc-900 dark:hover:border-brand-500/50"
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-zinc-50 text-xl dark:bg-zinc-800 ${meta.color}`}>
                          <meta.Icon className="h-6 w-6" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="truncate text-sm font-bold text-zinc-800 dark:text-zinc-100">{file.filename}</h4>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">{formatBytes(file.sizeBytes)}</p>
                        </div>
                      </div>
                      {isDownloading ? (
                        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-brand-500" />
                      ) : (
                        <Download className="h-5 w-5 shrink-0 text-zinc-300 transition group-hover:text-brand-500 dark:text-zinc-600" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {hasItems && (
            <div className="mt-8 flex items-center justify-center gap-4">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="rounded-lg bg-zinc-100 px-4 py-2 transition hover:bg-brand-500 hover:text-white disabled:pointer-events-none disabled:opacity-40 dark:bg-zinc-800">
                Prev
              </button>
              <span className="text-sm font-bold">Page {page} / {totalPages}</span>
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="rounded-lg bg-zinc-100 px-4 py-2 transition hover:bg-brand-500 hover:text-white disabled:pointer-events-none disabled:opacity-40 dark:bg-zinc-800">
                Next
              </button>
            </div>
          )}

          <footer className="mt-4 flex flex-col items-center gap-2 border-t border-zinc-100 pt-6 text-center dark:border-white/10">
            <p className="flex items-center gap-1.5 text-base font-medium text-zinc-500 dark:text-zinc-400">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              Protected by
              <img src={logoMainPng} alt={SITE_NAME} className="h-4 w-auto object-contain dark:brightness-0 dark:invert" />
            </p>
            <p className="text-base text-zinc-400 dark:text-zinc-500">
              &copy; {new Date().getFullYear()} {SITE_NAME}. All rights reserved.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}