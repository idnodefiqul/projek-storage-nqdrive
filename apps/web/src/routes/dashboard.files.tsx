import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import React, { useState, useCallback, useRef, type DragEvent, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Search, Trash2, Eye, EyeOff,
  Folder as FolderIcon, FolderPlus, Upload,
  ChevronRight, UploadCloud, CheckCircle2,
  FileIcon, X, Loader2, Home, Lock, Globe, EyeOff as EyeOffIcon,
  ChevronLeft, ChevronsLeft, ChevronsRight,
  Pencil, AlertTriangle, HardDrive, Share2, Link2, Globe2,
  Plus, Download, ExternalLink, FolderOpen, LayoutGrid, List,
  Sparkles, ChevronDown, Check, Ban,
} from "lucide-react";
import { SiDropbox } from "@icons-pack/react-simple-icons";
import { ArchiveBoxArrowDownIcon, FolderIcon as FolderSolid } from "@heroicons/react/24/solid";
import {
  Input, Button, Badge,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, useToast, cn,
} from "@nqdrive/ui";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { formatBytes } from "@nqdrive/shared";
import { useFiles, useDeleteFile, useUpdateFileVisibility, useRenameFile } from "../hooks/use-files";
import { useFormatAllDriveAccounts, useDriveAccounts } from "../hooks/use-drive-accounts";
import { useFolderByPath, useCreateFolder, useDeleteFolder, useRenameFolder, useShareFolder, useUnshareFolder } from "../hooks/use-folders";
import { useUpload } from "../hooks/use-upload";
import { useMinLoading } from "../hooks/use-min-loading";
import { useSettings } from "../hooks/use-settings";
import { buildDownloadPath } from "../services/settings.service";


import type { FileVisibility, FileWithAccount, Folder } from "@nqdrive/types";
import { getFileTypeInfo } from "../lib/file-icons";
import { FilePreviewDialog } from "../components/file-preview";
import { PageTransition } from "../components/page-transition";
import { PageHeader } from "../components/ui-kit";
import { googleDriveSvg, onedriveSvg } from "../assets";

// - URL schema: ?folder=Windows/11/subfolder -
// Menggunakan "folder" sebagai nama param (bukan "path") agar URL lebih deskriptif.
// Separator antar level folder adalah "/" literal - tidak di-encode jadi %2F.
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

// - Helpers -

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  return `${local.slice(0, 3)}***@${domain}`;
}

function EmailCell({ email }: { email: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm text-[rgb(var(--ink-500))] font-mono">
        {shown ? email : maskEmail(email)}
      </span>
      <button
        type="button"
        onClick={(e: React.MouseEvent) => { e.stopPropagation(); setShown((v: boolean) => !v); }}
        className="text-[rgb(var(--ink-500))] hover:text-[rgb(var(--ink-500))] dark:hover:text-[rgb(var(--foreground))] transition-colors"
        title={shown ? "Sembunyikan email" : "Tampilkan email"}
      >
        {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

/**
 * Breadcrumb component - renders clickable path segments.
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
  // Format: nama folder bergabung dengan "/" - tidak perlu encode karena
  // navigateTo() akan meneruskan nilai ini ke URL param "folder" secara langsung.
  const buildPath = (upTo: number) =>
    [...ancestors, currentFolder]
      .slice(0, upTo + 1)
      .map((f) => f!.name)
      .join("/");

  return (
    <nav className="flex items-center gap-1 text-sm text-[rgb(var(--ink-500))] flex-wrap">
      <button
        type="button"
        onClick={() => onNavigate("")}
        className="flex items-center gap-1 hover:text-brand-600 dark:hover:text-brand-400 transition-colors font-medium"
      >
        <Home className="h-3.5 w-3.5" />
        <span>Home</span>
      </button>

      {ancestors.map((folder, idx) => (
        <span key={folder.id} className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5 text-[rgb(var(--foreground))] dark:text-[rgb(var(--ink-500))]" />
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
          <ChevronRight className="h-3.5 w-3.5 text-[rgb(var(--foreground))] dark:text-[rgb(var(--ink-500))]" />
          <span className="font-semibold text-[rgb(var(--foreground))] dark:text-[rgb(var(--foreground))] max-w-[160px] truncate" title={currentFolder.name}>
            {currentFolder.name}
          </span>
        </span>
      )}
    </nav>
  );
}

// - Item type -
type ItemData =
  | { type: "folder"; data: Folder }
  | { type: "file"; data: FileWithAccount };

// Folder kuning pure solid + badge share hijau di foldernya (bukan di pojok card)
// Posisi badge di kanan-bawah icon folder seperti Google Drive, top-right card kosong untuk titik 3 menu
function FolderGlyph({ shared, size }: { shared?: boolean; size: number }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <FolderSolid className="text-amber-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.08)]" style={{ width: size, height: size }} />
      {shared && (
        <span
          className="absolute grid place-items-center rounded-full bg-emerald-500 text-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] ring-2 ring-white dark:ring-[rgb(var(--surface))]"
          style={{
            width: size * 0.42,
            height: size * 0.42,
            right: -size * 0.08,
            bottom: -size * 0.05,
          }}
        >
          <Share2 className="h-[58%] w-[58%]" />
        </span>
      )}
    </span>
  );
}

// FileCard dan FileRow — instant mount, NO motion per-card di list panjang (Facebook style)
// Optimized with React.memo + content-visibility for 90fps scroll
const FileCard = React.memo(function FileCard({ item, onOpen }: { item: ItemData; onOpen: () => void }) {
  const isFolder = item.type === "folder";
  const name = isFolder ? item.data.name : item.data.filename;
  const sub = isFolder
    ? (item.data.sizeBytes ? formatBytes(item.data.sizeBytes) : "Folder")
    : formatBytes(item.data.sizeBytes);

  return (
    <button
      onClick={onOpen}
      className="app-card app-card-interactive group relative flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-[14px] p-3 text-center sm:gap-2.5 sm:p-3.5"
    >
      <div className="grid h-[52px] w-[52px] place-items-center sm:h-[60px] sm:w-[60px]">
        {isFolder ? (
          <FolderGlyph shared={!!item.data.shareUuid} size={48} />
        ) : (
          (() => {
            const ft = getFileTypeInfo(item.data.filename);
            return <ft.Icon className={cn("h-10 w-10 sm:h-12 sm:w-12", ft.color)} />;
          })()
        )}
      </div>
      <div className="flex w-full flex-col items-center gap-0.5 px-1">
        <span className="line-clamp-2 w-full break-words text-[12px] font-semibold leading-[1.25] text-[rgb(var(--foreground))] sm:text-[13px]" title={name}>
          {name}
        </span>
        <span className="truncate text-[10.5px] font-medium leading-none text-[rgb(var(--ink-500))]/80 sm:text-[11px]">{sub}</span>
      </div>
    </button>
  );
});

const FileRow = React.memo(function FileRow({ item, onOpen }: { item: ItemData; onOpen: () => void }) {
  const isFolder = item.type === "folder";
  const name = isFolder ? item.data.name : item.data.filename;
  const sub = isFolder
    ? `${item.data.sizeBytes ? formatBytes(item.data.sizeBytes) : "Folder"}`
    : `${formatBytes(item.data.sizeBytes)} · ${item.data.downloadCount} unduhan`;

  return (
    <button
      onClick={onOpen}
      className="app-card app-card-interactive group flex w-full items-center gap-3 p-3 text-left"
    >
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[rgb(var(--surface-muted))]/70 sm:h-11 sm:w-11">
        {isFolder ? (
          <FolderGlyph shared={!!item.data.shareUuid} size={28} />
        ) : (
          (() => { const ft = getFileTypeInfo(item.data.filename); return <ft.Icon className={cn("h-6 w-6", ft.color)} />; })()
        )}
      </div>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold leading-tight text-[rgb(var(--foreground))]" title={name}>{name}</span>
        <span className="block truncate text-xs leading-tight text-[rgb(var(--ink-500))]">{sub}</span>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-[rgb(var(--ink-500))]/60 transition group-hover:translate-x-0.5" />
    </button>
  );
});

// --- Email Badge (toggle mask/reveal) ---
function EmailBadge({ email }: { email: string }) {
  const [shown, setShown] = useState(false);
  const mask = (e: string) => {
    const [local, domain] = e.split("@");
    if (!local || !domain) return e;
    return `${local.slice(0, 2)}*****@${domain}`;
  };
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--surface-muted))]/70 px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--ink-500))] font-mono">
      {shown ? email : mask(email)}
      <button onClick={() => setShown((v) => !v)} className="ml-0.5 text-[rgb(var(--ink-500))]/60 hover:text-[rgb(var(--ink-500))] transition-colors">
        {shown ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      </button>
    </span>
  );
}

const DETAIL_FOCUSABLE_SEL = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
function getDetailFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(DETAIL_FOCUSABLE_SEL)).filter((el) => {
    if (el.hasAttribute("disabled")) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    const cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    return el.getClientRects().length > 0 || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
  });
}

// --- DETAIL PANEL (kanan, gaya sidebar tema/menu/progress) ---

type DetailActions = {
  onNavigateFolder: (folder: Folder) => void;
  onPreviewFile: (file: FileWithAccount) => void;
  onCopyDirectLink: (file: FileWithAccount) => void;
  onCopyShareLink: (file: FileWithAccount) => void;
  onChangeVisibility: (file: FileWithAccount, v: FileVisibility) => Promise<void> | void;
  onRenameFile: (file: FileWithAccount) => Promise<void> | void;
  onDeleteFile: (file: FileWithAccount) => void;
  onShareFolder: (folder: Folder) => Promise<void> | void;
  onUnshareFolder: (folder: Folder) => Promise<void> | void;
  onCopyFolderLink: (folder: Folder) => void;
  onRenameFolder: (folder: Folder) => Promise<void> | void;
  onDeleteFolder: (folder: Folder) => void;
  onUpdateItem: (item: ItemData) => void;
};

function PanelBtn({ icon: Icon, label, onClick, tone = "default" }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; tone?: "default" | "brand" | "danger" }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors",
        tone === "brand" && "bg-brand-500 text-white hover:bg-brand-600",
        tone === "danger" && "text-red-600 hover:bg-red-500/10 dark:text-red-400",
        tone === "default" && "border border-[rgb(var(--border-subtle))] text-[rgb(var(--foreground))] hover:bg-[rgb(var(--surface-muted))]/70 dark:hover:bg-white/[0.06]"
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", tone === "default" && "text-[rgb(var(--ink-500))]")} />
      <span className="truncate text-left">{label}</span>
    </button>
  );
}

function DetailPanel({ item, onClose, actions }: { item: ItemData | null; onClose: () => void; actions: DetailActions }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleIdRef = useRef<string>(`detail-title-${Math.random().toString(36).slice(2,7)}`);
  const prevActiveRef = useRef<HTMLElement | null>(null);

  // Lock body scroll + focus management saat panel terbuka.
  useEffect(() => {
    const html = document.documentElement;
    if (item) {
      prevActiveRef.current = document.activeElement as HTMLElement | null;
      html.style.overflow = "hidden";
      requestAnimationFrame(() => {
        const c = panelRef.current;
        if (!c) return;
        const f = getDetailFocusable(c);
        f[0]?.focus();
      });
    } else {
      html.style.overflow = "";
      const prev = prevActiveRef.current;
      if (prev) setTimeout(() => { try { prev.focus(); } catch {} }, 0);
    }
    return () => { html.style.overflow = ""; };
  }, [item]);

  // Focus trap + Escape
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      const container = panelRef.current;
      if (!container) return;
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab") return;
      const focusable = getDetailFocusable(container);
      if (focusable.length === 0) { e.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length-1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !container.contains(active)) { e.preventDefault(); last!.focus(); }
      } else {
        if (active === last) { e.preventDefault(); first!.focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [item, onClose]);

  // State rename inline + guard anti-dobel-submit
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);
  const submittedRef = useRef(false);

  // State loading visibilitas & share folder
  const [visLoading, setVisLoading] = useState<FileVisibility | null>(null);
  const [shareLoading, setShareLoading] = useState(false);

  // Reset state saat item berubah
  useEffect(() => { setRenaming(false); setRenameVal(""); setVisLoading(null); setShareLoading(false); }, [item]);

  const startRename = () => {
    const currentName = item?.type === "folder" ? item.data.name : item?.type === "file" ? item.data.filename : "";
    setRenameVal(currentName);
    setRenaming(true);
    setTimeout(() => {
      if (renameRef.current) {
        const dot = currentName.lastIndexOf(".");
        renameRef.current.focus();
        if (dot > 0 && item?.type === "file") renameRef.current.setSelectionRange(0, dot);
        else renameRef.current.select();
      }
    }, 50);
  };

  // Fix 2: submit rename → update selectedItem.nama langsung via onUpdateItem
  const submitRename = async () => {
    // Guard: cegah eksekusi ganda (onClick tombol + onBlur input)
    if (submittedRef.current) return;
    submittedRef.current = true;
    if (!renameVal.trim() || !item) { setRenaming(false); submittedRef.current = false; return; }
    const newName = renameVal.trim();
    try {
      if (item.type === "file") {
        await actions.onRenameFile({ ...item.data, filename: newName } as FileWithAccount);
        actions.onUpdateItem({ type: "file", data: { ...item.data, filename: newName } });
      } else {
        await actions.onRenameFolder({ ...item.data, name: newName } as Folder);
        actions.onUpdateItem({ type: "folder", data: { ...item.data, name: newName } });
      }
    } catch {}
    setRenaming(false);
    submittedRef.current = false;
  };

  // Handler visibilitas dengan loading spinner + delay smooth
  const handleVis = async (file: FileWithAccount, v: FileVisibility) => {
    setVisLoading(v);
    // Delay kecil agar spinner terlihat smooth (bukan kedip sekejap)
    await new Promise((r) => setTimeout(r, 350));
    try {
      await actions.onChangeVisibility(file, v);
    } catch {}
    // Delay lagi sebelum hilangkan spinner agar transisi mulus
    await new Promise((r) => setTimeout(r, 200));
    setVisLoading(null);
  };

  // Fix 2: handler share folder dengan loading + auto-update
  const handleShare = async (folder: Folder) => {
    setShareLoading(true);
    await new Promise((r) => setTimeout(r, 350));
    try {
      await actions.onShareFolder(folder);
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
    setShareLoading(false);
  };

  // Handler unshare folder dengan loading + auto-update
  const handleUnshare = async (folder: Folder) => {
    setShareLoading(true);
    await new Promise((r) => setTimeout(r, 350));
    try {
      await actions.onUnshareFolder(folder);
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
    setShareLoading(false);
  };

  const isFolder = item?.type === "folder";
  const file = item?.type === "file" ? item.data : null;
  const folder = item?.type === "folder" ? item.data : null;
  const name = isFolder ? folder!.name : file?.filename ?? "";
  const ft = file ? getFileTypeInfo(file.filename) : null;
  const isPublic = file?.visibility === "public";

  // Header label + icon
  const headerLabel = isFolder ? "Detail Folder" : "Detail File";
  // Ikon header: folder = solid kuning, file = ArchiveBox
  const HeaderIconComponent = isFolder ? FolderSolid : ArchiveBoxArrowDownIcon;

  return (
    <AnimatePresence>
      {item && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="fixed inset-0 z-[70] bg-black/30 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleIdRef.current}
            tabIndex={-1}
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "tween", ease: [0.32, 0.72, 0, 1], duration: 0.42 }}
            className="fixed right-0 top-0 bottom-0 z-[71] flex w-72 max-w-[88vw] flex-col overflow-hidden rounded-l-3xl bg-[rgb(var(--surface))] shadow-[0_0_30px_-8px_rgba(0,0,0,0.25)] text-[rgb(var(--foreground))] sm:w-80 focus:outline-none"
          >
            {/* Fix 4: header dengan icon + label Detail File/Folder */}
            <div className="flex shrink-0 items-center gap-2.5 px-4 py-3">
              <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", isFolder ? "bg-amber-400/20 text-amber-500" : "bg-brand-500/10 text-brand-600 dark:text-brand-300")}>
                {isFolder
                  ? <FolderGlyph shared={!!folder!.shareUuid} size={18} />
                  : <HeaderIconComponent className="h-[18px] w-[18px]" />
                }
              </span>
              <h3 id={titleIdRef.current} className="flex-1 truncate text-sm font-bold text-[rgb(var(--foreground))]">{headerLabel}</h3>
              {/* Trash merah di header — selalu terlihat */}
              <button
                type="button"
                onClick={() => { if (file) actions.onDeleteFile(file); if (folder) actions.onDeleteFolder(folder); onClose(); }}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-red-500 transition hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                title="Pindahkan ke Trash"
                aria-label="Pindahkan ke Trash"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button type="button" onClick={onClose} aria-label="Tutup panel detail" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[rgb(var(--ink-500))] transition hover:bg-[rgb(var(--surface-muted))]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {/* Konten — satu scroll area utuh */}
            <div className="flex-1 min-h-0 space-y-3 overflow-y-auto overscroll-contain scrollbar-hide px-4 pb-4 text-sm">
              {/* Preview */}
              <div className="grid h-24 w-full place-items-center rounded-xl border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface-muted))]/50">
                {isFolder ? (
                  <FolderGlyph shared={!!folder!.shareUuid} size={48} />
                ) : ft ? (
                  <ft.Icon className={cn("h-12 w-12", ft.color)} />
                ) : null}
              </div>
              {/* Nama + tipe (rename inline) + badge */}
              <div>
                {renaming ? (
                  <div className="flex items-center gap-2">
                    <input
                      ref={renameRef}
                      value={renameVal}
                      onChange={(e) => setRenameVal(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") submitRename(); if (e.key === "Escape") setRenaming(false); }}
                      onBlur={submitRename}
                      className="flex-1 rounded-lg border border-brand-500 bg-transparent px-2 py-1 text-sm font-bold outline-none"
                      autoFocus
                    />
                    <button onClick={submitRename} className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-white">
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <h4 className="break-words text-[15px] font-bold leading-tight text-[rgb(var(--foreground))]">{name}</h4>
                )}
                <p className="mt-0.5 text-[11px] font-medium text-[rgb(var(--ink-500))]">{isFolder ? "Folder" : (ft?.label ?? "File")}</p>
                {file && (
                  <div className="mt-1.5 flex items-center gap-1.5 overflow-hidden">
                    <span className="inline-flex shrink-0 items-center rounded-full bg-[rgb(var(--surface-muted))]/70 p-1" title={file.driveAccountProvider === "dropbox" ? "Dropbox" : "Google Drive"}>
                      <ProviderIcon provider={file.driveAccountProvider} className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 truncate">
                      <EmailBadge email={file.driveAccountEmail} />
                    </span>
                  </div>
                )}
              </div>
              {/* Info */}
              <div className="space-y-1.5 rounded-xl border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface-muted))]/40 p-3 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-[rgb(var(--ink-500))]">Ukuran</span>
                  <span className="font-semibold">{isFolder ? (folder!.sizeBytes ? formatBytes(folder!.sizeBytes) : "0 B") : formatBytes(file!.sizeBytes)}</span>
                </div>
                {file && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-[rgb(var(--ink-500))]">Unduhan</span>
                      <span className="font-semibold">{file.downloadCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[rgb(var(--ink-500))]">Visibilitas</span>
                      <span className="font-semibold capitalize">{VISIBILITY_LABEL[file.visibility]}</span>
                    </div>
                  </>
                )}
              </div>
              {/* Aksi */}
              <div className="space-y-1.5">
                {isFolder ? (
                  <PanelBtn icon={FolderOpen} label="Buka Folder" tone="brand" onClick={() => { actions.onNavigateFolder(folder!); onClose(); }} />
                ) : ft?.previewable ? (
                  <PanelBtn icon={Eye} label="Preview" tone="brand" onClick={() => { actions.onPreviewFile(file!); onClose(); }} />
                ) : null}

                {file && (
                  <>
                    <button
                      onClick={() => isPublic && actions.onCopyDirectLink(file)}
                      disabled={!isPublic}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold transition-colors",
                        isPublic
                          ? "border border-[rgb(var(--border-subtle))] text-[rgb(var(--foreground))] hover:bg-[rgb(var(--surface-muted))]/70"
                          : "border border-[rgb(var(--border-subtle))] text-[rgb(var(--ink-500))]/40 cursor-not-allowed opacity-50"
                      )}
                    >
                      <Download className="h-4 w-4 shrink-0 text-[rgb(var(--ink-500))]" />
                      <span className="truncate text-left">Salin Link Direct{!isPublic ? " (Public only)" : ""}</span>
                    </button>
                    <button
                      onClick={() => isPublic && actions.onCopyShareLink(file)}
                      disabled={!isPublic}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold transition-colors",
                        isPublic
                          ? "border border-[rgb(var(--border-subtle))] text-[rgb(var(--foreground))] hover:bg-[rgb(var(--surface-muted))]/70"
                          : "border border-[rgb(var(--border-subtle))] text-[rgb(var(--ink-500))]/40 cursor-not-allowed opacity-50"
                      )}
                    >
                      <ExternalLink className="h-4 w-4 shrink-0 text-[rgb(var(--ink-500))]" />
                      <span className="truncate text-left">Salin Link Share{!isPublic ? " (Public only)" : ""}</span>
                    </button>
                    {/* Visibilitas */}
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--ink-500))]">Visibilitas</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(["public", "private", "hidden"] as const).map((v) => (
                        <button
                          key={v}
                          onClick={() => handleVis(file, v)}
                          disabled={visLoading !== null}
                          className={cn(
                            "flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 text-[10px] font-semibold capitalize transition-colors",
                            file.visibility === v
                              ? "border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-300"
                              : "border-[rgb(var(--border-subtle))] text-[rgb(var(--ink-500))] hover:bg-[rgb(var(--surface-muted))]/70",
                            visLoading === v && "border-brand-500 bg-brand-500/10"
                          )}
                        >
                          {visLoading === v ? (
                            <span className="h-3.5 w-3.5 rounded-full border-2 border-brand-500 border-t-transparent" style={{ animation: "spin 0.8s linear infinite" }} />
                          ) : v === "public" ? (
                            <Globe className="h-3.5 w-3.5" />
                          ) : v === "private" ? (
                            <Lock className="h-3.5 w-3.5" />
                          ) : (
                            <EyeOffIcon className="h-3.5 w-3.5" />
                          )}
                          {v}
                        </button>
                      ))}
                    </div>
                    <PanelBtn icon={Pencil} label="Ganti Nama" onClick={startRename} />
                  </>
                )}

                {folder && (
                  <>
                    {folder.shareUuid ? (
                      <>
                        <PanelBtn icon={Link2} label="Salin Link Share" onClick={() => actions.onCopyFolderLink(folder)} />
                        <button
                          onClick={() => handleUnshare(folder)}
                          disabled={shareLoading}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold transition-colors border border-[rgb(var(--border-subtle))] text-[rgb(var(--foreground))] hover:bg-[rgb(var(--surface-muted))]/70",
                            shareLoading && "opacity-60 cursor-not-allowed"
                          )}
                        >
                          {shareLoading ? (
                            <span className="h-4 w-4 shrink-0 rounded-full border-2 border-brand-500 border-t-transparent" style={{ animation: "spin 0.8s linear infinite" }} />
                          ) : (
                            <Globe2 className="h-4 w-4 shrink-0 text-[rgb(var(--ink-500))]" />
                          )}
                          <span className="truncate text-left">{shareLoading ? "Memproses..." : "Batalkan Share"}</span>
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleShare(folder)}
                        disabled={shareLoading}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold transition-colors border border-[rgb(var(--border-subtle))] text-[rgb(var(--foreground))] hover:bg-[rgb(var(--surface-muted))]/70",
                          shareLoading && "opacity-60 cursor-not-allowed"
                        )}
                      >
                        {shareLoading ? (
                          <span className="h-4 w-4 shrink-0 rounded-full border-2 border-brand-500 border-t-transparent" style={{ animation: "spin 0.8s linear infinite" }} />
                        ) : (
                          <Share2 className="h-4 w-4 shrink-0 text-[rgb(var(--ink-500))]" />
                        )}
                        <span className="truncate text-left">{shareLoading ? "Memproses..." : "Bagikan Folder"}</span>
                      </button>
                    )}
                    <PanelBtn icon={Pencil} label="Ganti Nama" onClick={startRename} />
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// --- FAB Mobile (+) ---
function Fab({ onNewFolder, onUpload }: { onNewFolder: () => void; onUpload: () => void }) {
  const [open, setOpen] = useState(false);
  // Di atas pagination (pagination sekarang di bawah statis, tinggi ~4.5rem)
  return (
    <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-30 flex flex-col items-end sm:hidden">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            className="mb-3 flex flex-col gap-2"
          >
            <button onClick={() => { onNewFolder(); setOpen(false); }} className="flex items-center gap-2.5 rounded-full border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] px-4 py-2.5 text-sm font-semibold text-[rgb(var(--foreground))] shadow-lg">
              <FolderPlus className="h-4 w-4 text-brand-500" /> New Folder
            </button>
            <button onClick={() => { onUpload(); setOpen(false); }} className="flex items-center gap-2.5 rounded-full border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] px-4 py-2.5 text-sm font-semibold text-[rgb(var(--foreground))] shadow-lg">
              <UploadCloud className="h-4 w-4 text-brand-500" /> Upload File
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        onClick={() => setOpen((v: boolean) => !v)}
        className="grid h-14 w-14 place-items-center rounded-full bg-brand-500 text-white shadow-lg shadow-brand-600/30 transition active:scale-95"
        aria-label="Aksi"
      >
        <Plus className={cn("h-6 w-6 transition-transform duration-300", open && "rotate-45")} />
      </button>
    </div>
  );
}

// --- PAGINATION ---

const PAGE_SIZES = [12, 21, 30, 50];

function getResponsivePageSize(): number {
  if (typeof window === "undefined") return 21;
  if (window.innerWidth < 640) return 12; // Android kecil
  if (window.innerWidth >= 1024) return 21; // Desktop besar
  return 15;
}

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
    <div className="flex flex-col gap-2.5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3">
      <div className="flex items-center gap-2 text-[13px] text-[rgb(var(--ink-500))] sm:text-sm">
        <span className="shrink-0">Tampilkan</span>
        <select
          value={pageSize}
          onChange={(e) => { onPageSize(Number(e.target.value)); onPage(1); }}
          className="h-8 rounded-md border border-[rgb(var(--border-subtle))] dark:border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface-muted))] dark:bg-[rgb(var(--surface-muted))] px-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20"
        >
          {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="shrink-0">per halaman</span>
      </div>

      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <span className="text-[11px] text-[rgb(var(--ink-500))] sm:text-xs">
          {total === 0 ? "Tidak ada file" : <>{from}&ndash;{to} dari {total}</>}
        </span>
        <div className="flex items-center gap-1">
          <PagBtn onClick={() => onPage(1)} disabled={page === 1} title="Halaman pertama">
            <ChevronsLeft className="h-3.5 w-3.5" />
          </PagBtn>
          <PagBtn onClick={() => onPage(page - 1)} disabled={page === 1} title="Sebelumnya">
            <ChevronLeft className="h-3.5 w-3.5" />
          </PagBtn>
          <span className="min-w-[64px] text-center text-xs font-medium text-[rgb(var(--ink-500))] dark:text-[rgb(var(--foreground))] px-1.5">
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
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[rgb(var(--border-subtle))] dark:border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] text-[rgb(var(--ink-500))] hover:bg-[rgb(var(--surface-muted))] dark:hover:bg-[rgb(var(--surface-muted))] hover:text-[rgb(var(--foreground))] dark:hover:text-[rgb(var(--foreground))] transition disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

// --- FILES PAGE ---


const FORMAT_ALL_CONFIRM_TEXT = "FORMAT SEMUA";

function ConfirmFormatAllDrivesDialog({
  open,
  onClose,
  onConfirm,
  totalFiles,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  totalFiles: number;
  isPending: boolean;
}) {
  const [confirmText, setConfirmText] = useState("");
  const matches = confirmText === FORMAT_ALL_CONFIRM_TEXT;

  const handleClose = () => { setConfirmText(""); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogHeader>
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <DialogTitle>Format All Drive?</DialogTitle>
        </div>
        <DialogDescription className="pl-[52px]">
          Semua <strong className="text-[rgb(var(--foreground))]">{totalFiles} file</strong> dari semua akun storage
          akan dihapus permanen dan tidak dapat dikembalikan.
        </DialogDescription>
      </DialogHeader>
      <div className="mx-4 mb-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-3">
        <p className="text-xs text-red-700 dark:text-red-400 font-medium">
          Tindakan ini tidak bisa dibatalkan. Semua file akan hilang selamanya dari Google Drive. Akun tetap terhubung.
        </p>
      </div>
      <div className="mx-4 mb-2 flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[rgb(var(--ink-500))] dark:text-[rgb(var(--ink-500))]">
          Ketik <strong className="text-[rgb(var(--foreground))] select-all">FORMAT SEMUA</strong> untuk konfirmasi
        </label>
        <Input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="FORMAT SEMUA"
          className="font-mono text-sm"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <DialogFooter>
        <Button variant="outline" className="border-[rgb(var(--border-subtle))] dark:border-[rgb(var(--border-subtle))] dark:text-[rgb(var(--foreground))] dark:bg-[rgb(var(--surface-muted))] hover:bg-[rgb(var(--surface-muted))] dark:hover:bg-[rgb(var(--surface-muted))] shrink-0" onClick={handleClose} disabled={isPending}>
          Batal
        </Button>
        <Button variant="destructive" onClick={onConfirm} disabled={!matches || isPending}>
          {isPending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Memformat...</>
          ) : (
            <><HardDrive className="mr-2 h-4 w-4" />Format All Drive</>
          )}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
function FilesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchParams = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: settings } = useSettings();

  // Path folder saat ini dari URL param "folder".
  // Contoh: "" = root, "Scripts" = folder Scripts, "Windows/11" = subfolder 11 di dalam Windows
  const currentFolderPath = searchParams.folder ?? "";

  // Navigasi ke folder path baru - mengupdate URL param "folder"
  const navigateTo = useCallback(
    (folderPath: string) => {
      navigate({ search: folderPath ? { folder: folderPath } : {} });
    },
    [navigate]
  );

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => getResponsivePageSize());
  const [search, setSearch] = useState("");

  // Responsive pageSize: Android kecil 12, Desktop besar 21
  useEffect(() => {
    const mqMobile = window.matchMedia("(max-width: 639px)");
    const mqDesktop = window.matchMedia("(min-width: 1024px)");
    const handler = () => {
      if (mqMobile.matches) setPageSize((prev) => (prev === 12 ? prev : 12));
      else if (mqDesktop.matches) setPageSize((prev) => (prev === 21 ? prev : 21));
      else setPageSize((prev) => (prev <= 15 ? 15 : prev));
    };
    // Set initial sekali lagi setelah mount (SSR safety)
    handler();
    mqMobile.addEventListener("change", handler);
    mqDesktop.addEventListener("change", handler);
    return () => {
      mqMobile.removeEventListener("change", handler);
      mqDesktop.removeEventListener("change", handler);
    };
  }, []);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<FileVisibility | "">("");

  // Debounce search 300ms untuk hindari fetch per keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const isSearching = !!debouncedSearch || !!visibilityFilter;

  // Reset pagination saat path berubah atau search berubah
  useEffect(() => { setPage(1); }, [currentFolderPath, debouncedSearch, visibilityFilter]);

  // Dialog states
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  // Preview state
  const [previewFile, setPreviewFile] = useState<FileWithAccount | null>(null);

  // Inline rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Delete confirm states
  const [fileToDelete, setFileToDelete] = useState<FileWithAccount | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);
  const [isFormatAllOpen, setIsFormatAllOpen] = useState(false);
  const formatAllDrives = useFormatAllDriveAccounts();
  const { data: driveAccountsData } = useDriveAccounts();
  const totalFilesAllAccounts = driveAccountsData?.accounts.reduce((s, a) => s + ((a as any).fileCount ?? 0), 0) ?? 0;

  // - Data fetching -
  // Selalu resolve path aktif - termasuk saat searching - agar folderId tetap tersedia
  const {
    data: pathData,
    isLoading: isLoadingPath,
    isFetching: isFetchingPath,
    isError: isPathError,
  } = useFolderByPath(currentFolderPath);

  // folderId folder aktif (null = root). Berlaku baik saat browse maupun search.
  const currentFolderId = pathData?.folderId ?? null;

  const emptyArray = useMemo(() => [] as any[], []);

  // Semua folder anak di path aktif (sebelum filter)
  const allFoldersRaw = useMemo(() => (pathData?.children ?? emptyArray) as Folder[], [pathData?.children, emptyArray]);

  // Filter folder client-side by search & visibility (folder tidak punya visibility → hide jika filter visibility aktif)
  const filteredFolders = useMemo<Folder[]>(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (visibilityFilter) return emptyArray;
    if (q) return allFoldersRaw.filter((f: Folder) => f.name.toLowerCase().includes(q));
    return allFoldersRaw;
  }, [allFoldersRaw, debouncedSearch, visibilityFilter, emptyArray]);

  const totalFolders = filteredFolders.length;

  // Hitung kebutuhan file untuk pagination gabungan (folder + file dalam satu halaman)
  // Konsep: daftar gabungan = [folder0..folderN-1, file0..fileM-1], dipaginate sebesar pageSize
  const fileQueryMeta = useMemo(() => {
    const combinedStart = (page - 1) * pageSize;
    const combinedEnd = page * pageSize;
    if (combinedEnd <= totalFolders) {
      // Halaman sepenuhnya folder, tidak perlu fetch file
      return { page: 1, pageSize: 1, skip: true, offset: 0, limit: 0, needFetch: false };
    } else if (combinedStart >= totalFolders) {
      // Halaman sepenuhnya file
      const offset = combinedStart - totalFolders;
      const fetchSize = offset + pageSize; // fetch dari 0 sampai offset+pageSize lalu slice
      return { page: 1, pageSize: fetchSize, skip: false, offset, limit: pageSize, needFetch: true };
    } else {
      // Overlap: sebagian folder + sebagian file
      const need = combinedEnd - totalFolders;
      return { page: 1, pageSize: need, skip: false, offset: 0, limit: need, needFetch: true };
    }
  }, [page, pageSize, totalFolders]);

  const { data: filesData, isLoading: isLoadingFiles, isFetching: isFetchingFiles } = useFiles(
    {
      folderId: currentFolderId !== null ? currentFolderId : 0,
      page: fileQueryMeta.page,
      pageSize: fileQueryMeta.pageSize,
      search: debouncedSearch || undefined,
      visibility: visibilityFilter || undefined,
    },
    {
      enabled: !isLoadingPath && fileQueryMeta.needFetch,
    }
  );

  // Total files count untuk pagination gabungan (selalu fetch 1 item untuk dapat totalItems, tidak tergantung halaman)
  // OPTIMIZED: gunakan placeholderData dan longer staleTime untuk hindari double fetch, totalItems sebenarnya bisa diambil dari filesData.totalItems
  const { data: totalFilesData, isLoading: isLoadingTotalFiles } = useFiles(
    {
      folderId: currentFolderId !== null ? currentFolderId : 0,
      page: 1,
      pageSize: 1,
      search: debouncedSearch || undefined,
      visibility: visibilityFilter || undefined,
    },
    {
      enabled: !isLoadingPath,
    }
  );

  // Jika path dari URL tidak ditemukan, kembali ke root
  useEffect(() => {
    if (isPathError && currentFolderPath) {
      toast({ title: "Folder tidak ditemukan", description: "Kembali ke root.", variant: "error" });
      navigateTo("");
    }
  }, [isPathError, currentFolderPath, navigateTo, toast]);

  // Smooth scroll ke atas tiap ganti folder (seperti file manager native)
  useEffect(() => {
    const scroller = document.querySelector(".dashboard-scroll") as HTMLElement | null;
    if (scroller) {
      // Scroll instant ke atas agar render list baru langsung terlihat lancar
      scroller.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
  }, [currentFolderPath]);

  const isQueryLoading = isLoadingPath || isLoadingFiles || isLoadingTotalFiles;
  const isFetchingData = useMinLoading(isQueryLoading, 150);

  // - Mutations -
  const createFolder = useCreateFolder();
  const deleteFolder = useDeleteFolder();
  const deleteFile = useDeleteFile();
  const updateVisibility = useUpdateFileVisibility();
  const renameFile = useRenameFile();
  const renameFolder = useRenameFolder();
  const shareFolder = useShareFolder();
  const unshareFolder = useUnshareFolder();
  const uploadHook = useUpload();

  // - Handlers -

  const handleFolderClick = useCallback((folder: Folder) => {
    // Append nama folder ke path saat ini dengan separator "/"
    // Tidak perlu encodeURIComponent - navigateTo akan meneruskan ke ?folder= param secara utuh
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
      toast({ title: "Folder dipindahkan ke Trash", variant: "success" });
    } catch (error) {
      toast({
        title: "Gagal memindahkan folder",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setFolderToDelete(null);
    }
  };

  const handleCopyDirectLink = useCallback((file: FileWithAccount) => {
    const baseUrl = window.location.origin;
    const endpoint = settings?.download_endpoint ?? "default";
    const path = buildDownloadPath(file.slug, file.shareCode, endpoint);
    const url = `${baseUrl}${path}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link direct download disalin", description: url, variant: "success" });
  }, [toast, settings]);

  const handleCopyLink = useCallback((file: FileWithAccount) => {
    const baseUrl = window.location.origin;
    const prefixSetting = (settings as any)?.share_page_prefix ?? "p";
    let prefix = "p";
    if (prefixSetting === "s") prefix = "s";
    else if (prefixSetting === "f") prefix = "f";
    else if (prefixSetting.startsWith("custom:")) prefix = prefixSetting.slice(7);

    const url = `${baseUrl}/${prefix}/${file.shareCode}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link share page disalin", description: url, variant: "success" });
  }, [toast, settings]);

  const handleShareFolder = useCallback(async (folder: Folder): Promise<string | null> => {
    try {
      const result = await shareFolder.mutateAsync(folder.id);
      const url = `${window.location.origin}${result.pageUrl}`;
      await navigator.clipboard.writeText(url);
      toast({ title: "Folder berhasil dibagikan", description: url, variant: "success" });
      return result.shareUuid;
    } catch (error) {
      toast({ title: "Gagal membagikan folder", description: error instanceof Error ? error.message : undefined, variant: "error" });
      return null;
    }
  }, [shareFolder, toast]);

  const handleUnshareFolder = useCallback(async (folder: Folder) => {
    try {
      await unshareFolder.mutateAsync(folder.id);
      toast({ title: "Folder tidak lagi dibagikan publik", variant: "success" });
    } catch (error) {
      toast({ title: "Gagal membatalkan share", description: error instanceof Error ? error.message : undefined, variant: "error" });
    }
  }, [unshareFolder, toast]);

  const handleCopyFolderLink = useCallback((folder: Folder) => {
    if (!folder.shareUuid) return;
    const url = `${window.location.origin}/folder/${folder.shareUuid}/${encodeURIComponent(folder.name)}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link share folder disalin", description: url, variant: "success" });
  }, [toast]);
  const handleDeleteFile = async () => {
    if (!fileToDelete) return;
    try {
      await deleteFile.mutateAsync(fileToDelete.id);
      toast({ title: "File dipindahkan ke Trash", variant: "success" });
    } catch (error) {
      toast({
        title: "Gagal memindahkan file",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setFileToDelete(null);
    }
  };

  const handleFormatAllConfirm = async () => {
    try {
      const result = await formatAllDrives.mutateAsync();
      toast({ title: `${result.totalDeletedFiles} file berhasil dihapus dari semua drive`, variant: "success" });
    } catch (error) {
      toast({ title: "Gagal memformat semua drive", description: error instanceof Error ? error.message : undefined, variant: "error" });
    } finally {
      setIsFormatAllOpen(false);
    }
  };

  const handleStartRenameFile = useCallback((file: FileWithAccount) => {
    setRenamingId(`file-${file.id}`);
    setRenameValue(file.filename);
    setTimeout(() => {
      const input = renameInputRef.current;
      if (input) {
        // Select only the name part, not the extension
        const dotIdx = file.filename.lastIndexOf(".");
        if (dotIdx > 0) {
          input.setSelectionRange(0, dotIdx);
        } else {
          input.select();
        }
      }
    }, 50);
  }, []);

  const handleStartRenameFolder = useCallback((folder: Folder) => {
    setRenamingId(`folder-${folder.id}`);
    setRenameValue(folder.name);
    setTimeout(() => renameInputRef.current?.select(), 50);
  }, []);

  // Rename LANGSUNG (dipakai dari DetailPanel) — submit + invalidate cache.
  const handleRenameFileDirect = useCallback(async (file: FileWithAccount) => {
    await renameFile.mutateAsync({ id: file.id, filename: file.filename });
    await queryClient.invalidateQueries();
    toast({ title: "Nama file diubah", variant: "success" });
  }, [renameFile, queryClient, toast]);

  const handleRenameFolderDirect = useCallback(async (folder: Folder) => {
    await renameFolder.mutateAsync({ id: folder.id, name: folder.name });
    await queryClient.invalidateQueries();
    toast({ title: "Nama folder diubah", variant: "success" });
  }, [renameFolder, queryClient, toast]);

  const handleRenameSubmit = useCallback(async () => {
    if (!renamingId || !renameValue.trim()) { setRenamingId(null); return; }
    const [type, idStr] = renamingId.split("-");
    const id = Number(idStr);
    try {
      if (type === "file") {
        await renameFile.mutateAsync({ id, filename: renameValue.trim() });
        toast({ title: "Nama file diubah", variant: "success" });
      } else {
        await renameFolder.mutateAsync({ id, name: renameValue.trim() });
        toast({ title: "Nama folder diubah", variant: "success" });
      }
      // Fix 3: invalidate cache agar list file/folder update
      await queryClient.invalidateQueries();
    } catch (error) {
      toast({ title: "Gagal mengubah nama", description: error instanceof Error ? error.message : undefined, variant: "error" });
    }
    setRenamingId(null);
  }, [renamingId, renameValue, renameFile, renameFolder, toast, queryClient]);

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleRenameSubmit();
    if (e.key === "Escape") setRenamingId(null);
  }, [handleRenameSubmit]);
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
      // Fix C: update selectedItem langsung agar sidebar menampilkan visibilitas terbaru
      setSelectedItem((prev) => {
        if (prev && prev.type === "file" && prev.data.id === file.id) {
          return { type: "file", data: { ...prev.data, visibility } };
        }
        return prev;
      });
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

  // View mode (grid/list) — persist ke localStorage
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    try {
      return localStorage.getItem("nqdrive-files-view") === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });
  useEffect(() => {
    try { localStorage.setItem("nqdrive-files-view", viewMode); } catch {}
  }, [viewMode]);
  const [selectedItem, setSelectedItem] = useState<ItemData | null>(null);

  // Pagination gabungan folder + file (fix Android: >10 item tidak ganti halaman malah ke bawah terus)
  // total = folder terfilter + total file server (dari query totalFilesData agar tetap ada saat file fetch diskip)
  const totalFiles = totalFilesData?.totalItems ?? filesData?.totalItems ?? 0;
  const totalCombined = totalFolders + totalFiles;

  const { foldersSlice, filesSlice } = useMemo(() => {
    const combinedStart = (page - 1) * pageSize;
    const combinedEnd = page * pageSize;
    if (combinedEnd <= totalFolders) {
      // Halaman penuh folder
      return {
        foldersSlice: filteredFolders.slice(combinedStart, combinedEnd),
        filesSlice: [] as FileWithAccount[],
      };
    } else if (combinedStart >= totalFolders) {
      // Halaman penuh file
      const offset = combinedStart - totalFolders;
      const allFetched = (filesData?.items ?? emptyArray) as FileWithAccount[];
      return {
        foldersSlice: [] as Folder[],
        filesSlice: allFetched.slice(offset, offset + pageSize),
      };
    } else {
      // Overlap: sisa folder + awal file
      const fFolders = filteredFolders.slice(combinedStart, totalFolders);
      const need = combinedEnd - totalFolders;
      const allFetched = (filesData?.items ?? emptyArray) as FileWithAccount[];
      return {
        foldersSlice: fFolders,
        filesSlice: allFetched.slice(0, need),
      };
    }
  }, [filteredFolders, filesData?.items, page, pageSize, totalFolders, emptyArray]);

  const itemList: ItemData[] = useMemo(() => [
    ...foldersSlice.map((f: Folder) => ({ type: "folder" as const, data: f })),
    ...filesSlice.map((f: FileWithAccount) => ({ type: "file" as const, data: f })),
  ], [foldersSlice, filesSlice]);

  // - Render -

  return (
    <>
    <PageTransition>
      {/* FIX: pagination tidak ngambang/sticky.
          - Outer flex flex-1 + min-h memastikan tinggi minimal = tinggi layar dikurangi header
          - Content flex-1 mendorong pagination ke bawah saat file sedikit (desktop & mobile)
          - Desktop: min-h lebih kecil + pb bawah agar pagination sedikit ke atas (tidak nempel bawah)
          - Safe-area inset untuk URL bar mobile
          - scrollbar-hide: hilangkan garis scroll seperti sidebar */}
      <div className="flex flex-1 min-h-[calc(100dvh-10rem)] flex-col gap-3 pb-2 scrollbar-hide sm:min-h-[calc(100dvh-9rem)] lg:min-h-[calc(100dvh-180px)]">
        {/* Toolbar — tetap di atas, tidak sticky floating */}
        <div className="app-card flex flex-col gap-2.5 p-3 sm:p-4">
          {/* Breadcrumb (Home) — di dalam kontainer, tepat di atas search */}
          {pathData?.ancestors && (
            <div className="min-w-0">
              <Breadcrumb ancestors={pathData.ancestors} currentFolder={pathData.folder ?? null} onNavigate={navigateTo} />
            </div>
          )}

          {/* Baris search + kontrol */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--ink-500))]" />
              <Input
                placeholder="Cari file atau folder..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="h-9 pl-9 bg-[rgb(var(--surface-muted))]/60 dark:bg-white/[0.04] text-sm"
              />
            </div>
            {/* Filter + toggle + buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={visibilityFilter}
                onChange={(e) => { setVisibilityFilter(e.target.value as FileVisibility | ""); setPage(1); }}
                className="h-9 rounded-lg border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface-muted))]/60 px-2.5 text-xs outline-none focus:ring-2 focus:ring-brand-500/20 dark:bg-white/[0.04]"
              >
                <option value="">Semua</option>
                <option value="public">Public</option>
                <option value="private">Private</option>
                <option value="hidden">Hidden</option>
              </select>
              <div className="flex items-center rounded-lg border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface-muted))]/60 p-0.5 dark:bg-white/[0.04]">
                <button type="button" aria-label="Tampilan grid" aria-pressed={viewMode === "grid"} onClick={() => setViewMode("grid")} className={cn("grid h-7 w-7 place-items-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500", viewMode === "grid" ? "bg-[rgb(var(--surface))] text-brand-600 shadow-sm" : "text-[rgb(var(--ink-500))]" )}>
                  <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button type="button" aria-label="Tampilan list" aria-pressed={viewMode === "list"} onClick={() => setViewMode("list")} className={cn("grid h-7 w-7 place-items-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500", viewMode === "list" ? "bg-[rgb(var(--surface))] text-brand-600 shadow-sm" : "text-[rgb(var(--ink-500))]" )}>
                  <List className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              <div className="hidden items-center gap-1.5 sm:flex">
                <Button variant="outline" onClick={() => setIsCreateFolderOpen(true)} className="h-9 px-2.5 text-xs">
                  <FolderPlus className="h-3.5 w-3.5 mr-1" /> Folder
                </Button>
                <Button onClick={() => setIsUploadOpen(true)} className="h-9 px-2.5 text-xs">
                  <Upload className="h-3.5 w-3.5 mr-1" /> Upload
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Grid/List file — flex-1 agar mendorong pagination ke bawah saat file sedikit */}
        <div key={currentFolderPath || "__root__"} className="flex flex-1 flex-col files-list-scroll scrollbar-hide">
          <div className="relative flex-1 scrollbar-hide">
          {isFetchingData ? (
            <div className={cn(
              "grid gap-2.5 sm:gap-3",
              viewMode === "grid"
                ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7"
                : "grid-cols-1"
            )}>
              {Array.from({ length: viewMode === "grid" ? 14 : 8 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-[14px] border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface-muted))]/50",
                    viewMode === "grid" ? "aspect-square w-full" : "h-[56px]",
                    // shimmer instead of pulse for smoother perceived perf
                    "animate-pulse"
                  )}
                >
                  {viewMode === "grid" ? (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3">
                      <div className="h-10 w-10 rounded-xl bg-[rgb(var(--border-subtle))]/60" />
                      <div className="flex flex-col items-center gap-1">
                        <div className="h-3 w-12 rounded bg-[rgb(var(--border-subtle))]/50" />
                        <div className="h-2.5 w-8 rounded bg-[rgb(var(--border-subtle))]/40" />
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full w-full items-center gap-3 px-3">
                      <div className="h-10 w-10 rounded-xl bg-[rgb(var(--border-subtle))]/60 shrink-0" />
                      <div className="flex flex-col gap-1.5">
                        <div className="h-3 w-24 rounded bg-[rgb(var(--border-subtle))]/50" />
                        <div className="h-2.5 w-16 rounded bg-[rgb(var(--border-subtle))]/40" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : itemList.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center" role="status" aria-live="polite">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-500/10 text-brand-600 ring-1 ring-brand-500/15">
                <FolderIcon className="h-7 w-7" aria-hidden="true" />
              </span>
              <p className="text-sm font-semibold text-[rgb(var(--foreground))]">{isSearching ? "Tidak ada hasil" : "Folder ini kosong"}</p>
              <p className="max-w-sm text-sm text-[rgb(var(--ink-500))]">
                {isSearching
                  ? currentFolderPath
                    ? `Tidak ada file atau folder yang cocok di folder "${currentFolderPath.split("/").pop()}".`
                    : "Tidak ada file atau folder yang cocok."
                  : "Upload file atau buat folder baru untuk memulai."}
              </p>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 scrollbar-hide files-list-scroll">
              {itemList.map((item) => (
                <FileCard
                  key={item.type === "folder" ? `f-${item.data.id}` : `fi-${item.data.id}`}
                  item={item}
                  onOpen={() => setSelectedItem(item)}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2 scrollbar-hide files-list-scroll">
              {itemList.map((item) => (
                <FileRow
                  key={item.type === "folder" ? `f-${item.data.id}` : `fi-${item.data.id}`}
                  item={item}
                  onOpen={() => setSelectedItem(item)}
                />
              ))}
            </div>
          )}
          </div>
        </div>

        {/* Pagination — DI BAWAH TERUS, tidak ngambang, tidak sticky.
            - mt-auto: dorong ke bawah layar saat file sedikit (desktop & mobile)
            - Kalau file banyak, pagination ikut di ujung bawah setelah list (perlu scroll)
            - Tidak pakai sticky/bottom-0, jadi tidak overlay/ngambang
            - Desktop: lg:mb-6 + pb agar sedikit ke atas (tidak nempel bawah)
            - Mobile: safe-area agar tidak terpotong URL bar Android
            - Total gabungan folder + file (fix Android >10 item tidak ganti halaman) */}
        <div className="mt-auto pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-4 sm:pb-2 lg:pb-8 lg:pt-6">
          <div className="app-card">
            <Pagination page={page} pageSize={pageSize} total={totalCombined} onPage={setPage} onPageSize={setPageSize} />
          </div>
        </div>
      </div>
    </PageTransition>

    {/* Detail Panel — portal ke body agar full-screen seperti sidebar tema/progress */}
    {createPortal(
      <DetailPanel
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        actions={{
          onNavigateFolder: handleFolderClick,
          onPreviewFile: (f) => { setPreviewFile(f); window.scrollTo({ top: 0, behavior: "smooth" }); },
          onCopyDirectLink: handleCopyDirectLink,
          onCopyShareLink: handleCopyLink,
          onChangeVisibility: handleVisibilityChange,
          onRenameFile: handleRenameFileDirect,
          onDeleteFile: (f) => setFileToDelete(f),
          onShareFolder: async (f) => {
            const newShareUuid = await handleShareFolder(f);
            if (newShareUuid) {
              setSelectedItem((prev) => prev && prev.type === "folder" && prev.data.id === f.id ? { type: "folder", data: { ...prev.data, shareUuid: newShareUuid } } : prev);
            }
          },
          onUnshareFolder: async (f) => { await handleUnshareFolder(f); setSelectedItem((prev) => prev && prev.type === "folder" && prev.data.id === f.id ? { type: "folder", data: { ...prev.data, shareUuid: null } } : prev); },
          onCopyFolderLink: handleCopyFolderLink,
          onRenameFolder: handleRenameFolderDirect,
          onDeleteFolder: (f) => setFolderToDelete(f),
          onUpdateItem: (updated) => setSelectedItem(updated),
        }}
      />,
      document.body
    )}

    {/* FAB Mobile — portal ke body */}
    {createPortal(
      <Fab
        onNewFolder={() => setIsCreateFolderOpen(true)}
        onUpload={() => setIsUploadOpen(true)}
      />,
      document.body
    )}

    {/* Dialogs — di dalam fragment */}
    <Dialog open={!!fileToDelete} onOpenChange={(open) => !open && setFileToDelete(null)}>
      <DialogHeader>
        <DialogTitle>Pindahkan ke Trash?</DialogTitle>
        <DialogDescription>
          File "{fileToDelete?.filename}" akan dipindahkan ke Trash. Anda dapat memulihkannya kembali dalam waktu 30 hari.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={() => setFileToDelete(null)}>Batal</Button>
        <Button variant="destructive" onClick={handleDeleteFile} disabled={deleteFile.isPending}>
          {deleteFile.isPending ? "Memindahkan..." : "Pindahkan ke Trash"}
        </Button>
      </DialogFooter>
    </Dialog>

    <Dialog open={!!folderToDelete} onOpenChange={(open) => !open && setFolderToDelete(null)}>
      <DialogHeader>
        <DialogTitle>Pindahkan ke Trash?</DialogTitle>
        <DialogDescription>
          Folder "{folderToDelete?.name}" beserta seluruh sub-folder dan file di dalamnya akan dipindahkan ke Trash. Anda dapat memulihkannya kembali dalam waktu 30 hari.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={() => setFolderToDelete(null)}>Batal</Button>
        <Button variant="destructive" onClick={handleDeleteFolder} disabled={deleteFolder.isPending}>
          {deleteFolder.isPending ? "Memindahkan..." : "Pindahkan ke Trash"}
        </Button>
      </DialogFooter>
    </Dialog>

    <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
      <DialogHeader>
        <DialogTitle>Buat Folder Baru</DialogTitle>
        <DialogDescription>
          {currentFolderPath ? `Akan dibuat di: ${currentFolderPath}` : "Akan dibuat di root."}
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

    {/* Preview — portal ke body agar full-screen di Android */}
    {createPortal(
      <FilePreviewDialog file={previewFile} onClose={() => setPreviewFile(null)} />,
      document.body
    )}

    <ConfirmFormatAllDrivesDialog
      open={isFormatAllOpen}
      onClose={() => setIsFormatAllOpen(false)}
      onConfirm={handleFormatAllConfirm}
      totalFiles={totalFilesAllAccounts}
      isPending={formatAllDrives.isPending}
    />
    <UploadDialog
      open={isUploadOpen}
      onOpenChange={setIsUploadOpen}
      currentFolderId={currentFolderId}
      currentFolderPath={currentFolderPath}
    />
    </>
  );
}

// - Upload dialog -



// ─── Destinasi upload: deteksi kapasitas per-provider ─────────────────────────
// Harus konsisten dengan backend (packages/storage/account-selector.ts):
// Dropbox sisakan 300 MB, provider lain 1 GB.
const RESERVE_DROPBOX_BYTES = 300 * 1024 * 1024;
const RESERVE_DEFAULT_BYTES = 1 * 1024 * 1024 * 1024;

function reserveForProvider(provider?: string): number {
  return provider === "dropbox" ? RESERVE_DROPBOX_BYTES : RESERVE_DEFAULT_BYTES;
}
function accountFitsFile(acc: any, fileSize: number): boolean {
  return (acc.availableStorageBytes ?? 0) >= fileSize + reserveForProvider(acc.provider);
}
function maskAccountEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  return `${local.slice(0, 3)}***@${domain}`;
}

function ProviderIcon({ provider, className }: { provider?: string; className?: string }) {
  if (provider === "dropbox") return <SiDropbox color="#0061FF" className={className} />;
  if (provider === "onedrive") return <img src={onedriveSvg} alt="" className={className} />;
  return <img src={googleDriveSvg} alt="" className={className} />;
}

/**
 * Pemilih destinasi upload profesional (menggantikan <select> beremoji).
 * Menampilkan opsi Otomatis + daftar akun Google Drive & Dropbox dengan ikon,
 * sisa ruang, dan menon-aktifkan akun yang ruangnya tidak cukup untuk file ini.
 */
function DestinationSelect({
  item,
  accounts,
  onChange,
}: {
  item: any;
  accounts: any[];
  onChange: (accountId: number | null, provider?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 256, flipUp: false });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const online = accounts.filter((a) => a.status === "online");
  const selected = item.targetAccountId
    ? accounts.find((a) => a.id === item.targetAccountId)
    : null;
  const fileSize = item.file?.size ?? 0;

  const groups = [
    { provider: "google_drive", label: "Google Drive", items: online.filter((a) => a.provider === "google_drive") },
    { provider: "dropbox", label: "Dropbox", items: online.filter((a) => a.provider === "dropbox") },
    { provider: "onedrive", label: "OneDrive", items: online.filter((a) => a.provider === "onedrive") },
  ].filter((g) => g.items.length > 0);

  const reposition = () => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const menuH = 288; // max-h-72
    const gap = 6;
    const flipUp = r.bottom + gap + menuH > window.innerHeight - 8;
    setPos({
      top: flipUp ? r.top - gap - menuH : r.bottom + gap,
      left: Math.min(r.left, window.innerWidth - 272),
      width: Math.max(r.width, 256),
      flipUp,
    });
  };

  const toggle = () => {
    if (open) { setOpen(false); return; }
    reposition();
    setOpen(true);
  };

  // Close on outside click (both trigger & menu)
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        className="flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] px-2.5 py-1 text-xs font-medium text-[rgb(var(--ink-500))] dark:text-[rgb(var(--foreground))] outline-none transition-all hover:border-brand-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
      >
        {selected ? (
          <>
            <ProviderIcon provider={selected.provider} className="h-3.5 w-3.5 shrink-0" />
            <span className="max-w-[120px] truncate">{maskAccountEmail(selected.email)}</span>
          </>
        ) : (
          <>
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-500" />
            <span>Otomatis</span>
          </>
        )}
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-[rgb(var(--ink-500))] transition-transform", open && "rotate-180")} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[9999] overflow-y-auto rounded-xl border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] p-1.5 shadow-2xl dark:border-[rgb(var(--border-subtle))] dark:bg-[rgb(var(--surface))]"
          style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: 288, animation: "fadeIn 0.12s ease-out" }}
        >
          {/* Otomatis */}
          <button
            type="button"
            onClick={() => { onChange(null); setOpen(false); }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-[rgb(var(--surface-muted))] dark:hover:bg-[rgb(var(--surface-muted))]",
              !selected && "bg-brand-50 dark:bg-brand-500/10"
            )}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-100 dark:bg-brand-500/20">
              <Sparkles className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-[rgb(var(--foreground))]">Otomatis</span>
              <span className="block text-[10px] text-[rgb(var(--ink-500))]">Pilih akun terbaik otomatis</span>
            </span>
            {!selected && <Check className="h-4 w-4 shrink-0 text-brand-500" />}
          </button>

          {groups.map((group) => (
            <div key={group.provider}>
              <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--ink-500))]">{group.label}</p>
              {group.items.map((acc) => {
                const fits = accountFitsFile(acc, fileSize);
                const isSelected = item.targetAccountId === acc.id;
                return (
                  <button
                    key={acc.id}
                    type="button"
                    disabled={!fits}
                    onClick={() => { onChange(acc.id, acc.provider); setOpen(false); }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
                      fits ? "hover:bg-[rgb(var(--surface-muted))] dark:hover:bg-[rgb(var(--surface-muted))]" : "cursor-not-allowed opacity-50",
                      isSelected && "bg-brand-50 dark:bg-brand-500/10"
                    )}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--surface))] ring-1 ring-[rgb(var(--border-subtle))] dark:bg-[rgb(var(--surface))] dark:ring-[rgb(var(--border-subtle))]">
                      <ProviderIcon provider={acc.provider} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-[rgb(var(--foreground))]">{maskAccountEmail(acc.email)}</span>
                      <span className={cn("flex items-center gap-1 text-[10px]", fits ? "text-[rgb(var(--ink-500))]" : "text-red-500")}>
                        {fits ? (
                          `Sisa ${formatBytes(acc.availableStorageBytes)}`
                        ) : (
                          <><Ban className="h-3 w-3" /> Ruang tidak cukup</>
                        )}
                      </span>
                    </span>
                    {isSelected && fits && <Check className="h-4 w-4 shrink-0 text-brand-500" />}
                  </button>
                );
              })}
            </div>
          ))}

          {groups.length === 0 && (
            <p className="px-2.5 py-3 text-center text-[11px] text-[rgb(var(--ink-500))]">Belum ada akun storage online.</p>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

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
  const uploadHook = useUpload();
  const { items, addFilesToQueue, startAllUploads, removeItem } = uploadHook;
  const { data: driveAccountsData } = useDriveAccounts();
  const accounts = driveAccountsData?.accounts || [];
  
  console.log("UploadDialog renders, items:", items);

  const dialogItems = items.filter((i: any) => i.status === "queued");

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      addFilesToQueue(files, currentFolderId);
      setTimeout(() => {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }, 50);
    },
    [addFilesToQueue, currentFolderId]
  );

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingOver(false);
    handleFiles(event.dataTransfer.files);
  };

  const hasQueued = dialogItems.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-no-click-outside={(e: any) => {
        // Prevent closing when clicking outside if uploading
        if (items.some((i: any) => i.status === "uploading")) {
          e.preventDefault();
        }
      }}>
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
              : "border-[rgb(var(--border-subtle))] dark:border-[rgb(var(--border-subtle))] hover:bg-[rgb(var(--surface-muted))] dark:hover:bg-[rgb(var(--surface))]"
          )}
        >
          <UploadCloud className="h-8 w-8 text-[rgb(var(--ink-500))]" />
          <p className="text-sm font-medium text-[rgb(var(--ink-500))] dark:text-[rgb(var(--foreground))] text-center px-4">
            Seret file ke sini, atau{" "}
            <span className="text-brand-600 dark:text-brand-400">klik untuk memilih</span>
          </p>
          <p className="text-xs text-[rgb(var(--ink-500))]">Maksimal 15 GB per file</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        {dialogItems.length > 0 && (
          <div className="flex flex-col gap-2 max-h-[40vh] overflow-y-auto pr-1">
            {dialogItems.map((item: any) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-md border border-[rgb(var(--border-subtle))] p-3 bg-[rgb(var(--surface-muted))]/50 dark:bg-[rgb(var(--surface))]/50"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[rgb(var(--surface))] dark:bg-[rgb(var(--surface-muted))] shadow-sm border border-[rgb(var(--border-subtle))] dark:border-[rgb(var(--border-subtle))]">
                  <FileIcon className="h-4 w-4 text-[rgb(var(--ink-500))]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
                    {item.file.name}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-[rgb(var(--ink-500))] font-mono">{formatBytes(item.file.size)}</span>
                    <span className="text-[rgb(var(--foreground))] dark:text-[rgb(var(--ink-500))]">•</span>
                    <label className="text-[10px] font-bold text-[rgb(var(--ink-500))] dark:text-[rgb(var(--ink-500))] uppercase tracking-wide">Destinasi:</label>
                    <DestinationSelect
                      item={item}
                      accounts={accounts}
                      onChange={(accId, provider) => {
                        if (accId === null) uploadHook.setTargetAccount(item.id, null);
                        else uploadHook.setTargetAccount(item.id, accId, provider);
                      }}
                    />
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-[rgb(var(--ink-500))] hover:text-red-500"
                  onClick={() => removeItem(item.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <DialogFooter className="flex-row justify-end items-center sm:justify-end">
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            className="border-[rgb(var(--border-subtle))] dark:border-[rgb(var(--border-subtle))] dark:text-[rgb(var(--foreground))] dark:bg-[rgb(var(--surface-muted))] hover:bg-[rgb(var(--surface-muted))] dark:hover:bg-[rgb(var(--surface-muted))]"
          >
            Tutup
          </Button>
          <Button 
            onClick={() => {
              startAllUploads();
              onOpenChange(false); // Auto close dialog after starting upload
            }} 
            disabled={!hasQueued}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            Mulai Upload
          </Button>
        </div>
      </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
