import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Save, Loader2, Maximize2, Minimize2, Edit3, Check,
  AlertTriangle, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Lock,
} from "lucide-react";
import { Button, Input, useToast } from "@nqdrive/ui";
import { usePreviewToken, useFileContent, useUpdateFileContent, useRenameSyncFile } from "../hooks/use-files";
import { getFileTypeInfo } from "../lib/file-icons";
import { formatBytes } from "@nqdrive/shared";
import type { FileWithAccount } from "@nqdrive/types";

const WORKER_BASE = (import.meta.env.VITE_WORKER_URL as string | undefined) ?? "";
const FADE = { duration: 0.2, ease: [0.4, 0, 0.2, 1] as const };

function streamUrl(token: string) {
  return `${WORKER_BASE}/api/files/stream?token=${encodeURIComponent(token)}`;
}

// ── PDF Viewer (canvas-based, uses pdf.js from CDN) ──

let pdfjsLib: any = null;
async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  const src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs";
  const mod = await import(/* @vite-ignore */ src);
  mod.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";
  pdfjsLib = mod;
  return mod;
}

function PdfViewer({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [totalPages, setTotalPages] = useState(0);

  const renderPdf = useCallback(async (pw?: string) => {
    setLoading(true);
    setError(null);
    try {
      const pdfjs = await loadPdfJs();
      const loadingTask = pdfjs.getDocument({ url, password: pw || undefined, useSystemFonts: true });
      const pdf = await loadingTask.promise;
      setTotalPages(pdf.numPages);
      setNeedsPassword(false);

      const rendered: string[] = [];
      const scale = window.innerWidth < 768 ? 1.5 : 2;

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;
        rendered.push(canvas.toDataURL("image/png"));
      }
      setPages(rendered);
    } catch (err: any) {
      if (err?.name === "PasswordException") {
        setNeedsPassword(true);
      } else {
        setError(err?.message || "Gagal memuat PDF");
      }
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => { renderPdf(); }, [renderPdf]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim()) renderPdf(password.trim());
  };

  if (loading) return <div className="flex items-center justify-center h-full min-h-[300px]"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>;

  if (needsPassword) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px] p-6">
        <form onSubmit={handlePasswordSubmit} className="flex flex-col items-center gap-4 w-full max-w-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10">
            <Lock className="h-8 w-8 text-amber-500" />
          </div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">PDF dilindungi password</p>
          <p className="text-xs text-zinc-500 text-center">Masukkan password untuk membuka dokumen ini.</p>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password PDF"
            className="text-center"
            autoFocus
          />
          <Button type="submit" disabled={!password.trim()} className="w-full">Buka PDF</Button>
        </form>
      </div>
    );
  }

  if (error) return (
    <div className="flex flex-col items-center justify-center gap-4 p-12 text-center h-full min-h-[300px]">
      <AlertTriangle className="h-8 w-8 text-red-500" />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{error}</p>
    </div>
  );

  return (
    <div ref={containerRef} className="flex flex-col items-center gap-3 p-4 overflow-auto h-full bg-zinc-100 dark:bg-zinc-950">
      {pages.map((src, i) => (
        <div key={i} className="w-full max-w-3xl">
          <img src={src} alt={`Page ${i + 1}`} className="w-full h-auto shadow-md rounded-sm bg-white" loading="lazy" />
          <p className="text-center text-[10px] text-zinc-400 mt-1">{i + 1} / {totalPages}</p>
        </div>
      ))}
    </div>
  );
}

// Custom Video Player — streaming style, full-screen video with logo overlay

function VideoPlayer({ url, onClose }: { url: string; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showUI, setShowUI] = useState(true);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [isBrowserFS, setIsBrowserFS] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fmt = (s: number) => {
    if (!isFinite(s) || s < 0) return "0:00";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}` : `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    v.paused ? v.play() : v.pause();
  };

  const toggleFS = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) { document.exitFullscreen(); setIsBrowserFS(false); }
    else { el.requestFullscreen?.().then(() => setIsBrowserFS(true)).catch(() => {}); }
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    setCurrentTime(v.currentTime);
    setProgress((v.currentTime / v.duration) * 100);
    if (v.buffered.length > 0) setBuffered((v.buffered.end(v.buffered.length - 1) / v.duration) * 100);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    v.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * v.duration;
  };

  const resetHide = () => {
    setShowUI(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { if (videoRef.current && !videoRef.current.paused) setShowUI(false); }, 3000);
  };

  useEffect(() => {
    const onFSChange = () => { if (!document.fullscreenElement) setIsBrowserFS(false); };
    document.addEventListener("fullscreenchange", onFSChange);
    return () => { document.removeEventListener("fullscreenchange", onFSChange); if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, []);

  if (error) return (
    <div className="flex flex-col items-center justify-center gap-4 p-12 h-full min-h-[300px] bg-black">
      <AlertTriangle className="h-8 w-8 text-red-500" />
      <p className="text-sm text-zinc-400">Gagal memuat video</p>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden cursor-pointer"
      onClick={togglePlay}
      onMouseMove={resetHide}
      onTouchStart={resetHide}
    >
      {/* Video element — fills entire container */}
      <video
        ref={videoRef}
        src={url}
        playsInline
        autoPlay
        className="w-full h-full object-contain"
        onError={() => setError(true)}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => { if (videoRef.current) { setDuration(videoRef.current.duration); setIsPlaying(!videoRef.current.paused); } }}
        onPlay={() => { setIsPlaying(true); resetHide(); }}
        onPause={() => { setIsPlaying(false); setShowUI(true); }}
        onEnded={() => { setIsPlaying(false); setShowUI(true); }}
      />

      {/* Logo — top-left inside video, always visible */}
      <img src="/logopage.png" alt="" className="absolute top-4 left-4 h-8 sm:h-10 w-auto opacity-50 pointer-events-none select-none drop-shadow-lg" />

      {/* Center play button — only when paused */}
      <AnimatePresence>
        {!isPlaying && (
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <div className="flex h-18 w-18 sm:h-22 sm:w-22 items-center justify-center rounded-full bg-brand-500/80 shadow-xl shadow-brand-500/30">
              <svg viewBox="0 0 24 24" className="h-10 w-10 sm:h-12 sm:w-12 text-white ml-1" fill="currentColor"><polygon points="6,3 20,12 6,21" /></svg>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top bar — title + close */}
      <AnimatePresence>
        {showUI && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent pt-3 pb-12 px-4 flex items-start justify-between pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div />
            <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors backdrop-blur-sm">
              <X className="h-5 w-5 text-white" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom controls */}
      <AnimatePresence>
        {showUI && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-12 pb-4 px-4 pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Progress bar */}
            <div className="group cursor-pointer mb-3" onClick={handleSeek}>
              <div className="relative h-1 group-hover:h-2 transition-all rounded-full bg-white/20 overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-white/20 rounded-full transition-all" style={{ width: `${buffered}%` }} />
                <div className="absolute inset-y-0 left-0 bg-brand-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                <div className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-brand-500 shadow-md opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: `calc(${progress}% - 6px)` }} />
              </div>
            </div>

            {/* Controls row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button onClick={togglePlay} className="text-white hover:text-brand-400 transition-colors">
                  {isPlaying ? (
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor"><polygon points="6,3 20,12 6,21" /></svg>
                  )}
                </button>
                <span className="text-sm text-white/90 font-mono tabular-nums">{fmt(currentTime)} <span className="text-white/40">/</span> {fmt(duration)}</span>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={toggleFS} className="text-white/80 hover:text-white transition-colors" title="Fullscreen">
                  {isBrowserFS ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
// ── Image Viewer (full width, scroll vertical) ──

function ImageViewer({ url, filename }: { url: string; filename: string }) {
  const [error, setError] = useState(false);

  if (error) return (
    <div className="flex flex-col items-center justify-center gap-4 p-12 h-full min-h-[300px]">
      <AlertTriangle className="h-8 w-8 text-red-500" />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">Gagal memuat gambar</p>
    </div>
  );

  return (
    <div className="flex items-center justify-center overflow-auto h-full bg-zinc-100 dark:bg-zinc-950 p-2">
      <img
        src={url}
        alt={filename}
        className="max-w-full w-auto h-auto object-contain"
        onError={() => setError(true)}
        draggable={false}
      />
    </div>
  );
}

// ── Main Dialog ──

interface Props { file: FileWithAccount | null; onClose: () => void; }

export function FilePreviewDialog({ file, onClose }: Props) {
  const { toast } = useToast();
  const typeInfo = file ? getFileTypeInfo(file.filename) : null;
  const previewable = typeInfo?.previewable;

  const needsStream = !!file && (previewable === "image" || previewable === "video" || previewable === "audio" || previewable === "pdf");
  const needsText = !!file && previewable === "text";

  const { data: tokenData, isLoading: isLoadingToken, isError: isTokenError } = usePreviewToken(needsStream ? file!.slug : null);
  const { data: textData, isLoading: isLoadingText, isError: isTextError } = useFileContent(needsText ? file!.slug : null);
  const updateContent = useUpdateFileContent();
  const renameSync = useRenameSyncFile();

  const [textContent, setTextContent] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => { if (textData?.content !== undefined) setTextContent(textData.content); }, [textData?.content]);
  useEffect(() => { if (file) setNewName(file.filename); }, [file]);
  useEffect(() => { if (!file) { setIsEditing(false); setIsRenaming(false); } }, [file]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);

  const handleSaveText = useCallback(async () => {
    if (!file) return;
    try { await updateContent.mutateAsync({ slug: file.slug, content: textContent }); setIsEditing(false); toast({ title: "File berhasil disimpan", variant: "success" }); }
    catch (e) { toast({ title: "Gagal menyimpan", description: e instanceof Error ? e.message : undefined, variant: "error" }); }
  }, [file, textContent, updateContent, toast]);

  const handleRename = useCallback(async () => {
    if (!file || !newName.trim() || newName.trim() === file.filename) { setIsRenaming(false); return; }
    try { await renameSync.mutateAsync({ slug: file.slug, filename: newName.trim() }); setIsRenaming(false); toast({ title: "Nama file diperbarui", variant: "success" }); }
    catch (e) { toast({ title: "Gagal rename", description: e instanceof Error ? e.message : undefined, variant: "error" }); }
  }, [file, newName, renameSync, toast]);

  if (!file) return null;

  const { Icon, color } = typeInfo!;
  const sUrl = tokenData ? streamUrl(tokenData.token) : null;
  const isLoading = (needsStream && isLoadingToken) || (needsText && isLoadingText);
  const hasError = isTokenError || isTextError;

  // Video: full-screen player without dialog wrapper
  if (previewable === "video" && sUrl && !isLoadingToken && !hasError) {
    return (
      <AnimatePresence>
        <motion.div key="video-fs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE}
          className="fixed inset-0 z-[100] bg-black">
          <VideoPlayer url={sUrl} onClose={onClose} />
        </motion.div>
      </AnimatePresence>
    );
  }

  // Video loading state
  if (previewable === "video" && isLoadingToken) {
    return (
      <AnimatePresence>
        <motion.div key="video-loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE}
          className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-brand-500" />
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      {file && (
        <motion.div key="preview-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }} onClick={(e) => e.stopPropagation()}
            className={`relative flex flex-col bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden ${isFullscreen ? "w-full h-full rounded-none" : "w-full max-w-4xl max-h-[90vh] rounded-2xl"}`}>

            {/* Header */}
            <div className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${typeInfo!.bg}`}><Icon className={`h-4 w-4 ${color}`} /></div>
              <div className="flex-1 min-w-0">
                {isRenaming ? (
                  <div className="flex items-center gap-2">
                    <Input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setIsRenaming(false); }} className="h-8 text-sm" autoFocus />
                    <Button size="icon" variant="ghost" onClick={handleRename} disabled={renameSync.isPending} className="h-8 w-8 shrink-0">
                      {renameSync.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-brand-500" />}
                    </Button>
                  </div>
                ) : (
                  <button onClick={() => setIsRenaming(true)} className="flex items-center gap-1.5 group text-left w-full" title="Klik untuk rename">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{file.filename}</p>
                    <Edit3 className="h-3 w-3 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                )}
                <p className="text-xs text-zinc-500 mt-0.5">{formatBytes(file.sizeBytes)} {"\u00B7"} {typeInfo!.label}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {previewable === "text" && !isEditing && <Button size="icon" variant="ghost" onClick={() => setIsEditing(true)} className="h-8 w-8" title="Edit"><Edit3 className="h-4 w-4" /></Button>}
                {previewable === "text" && isEditing && <Button size="icon" variant="ghost" onClick={handleSaveText} disabled={updateContent.isPending} className="h-8 w-8" title="Simpan">{updateContent.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 text-brand-500" />}</Button>}
                <Button size="icon" variant="ghost" onClick={() => setIsFullscreen(v => !v)} className="h-8 w-8 hidden sm:flex" title={isFullscreen ? "Kecilkan" : "Perbesar"}>{isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</Button>
                <Button size="icon" variant="ghost" onClick={onClose} className="h-8 w-8" title="Tutup"><X className="h-4 w-4" /></Button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto min-h-0">
              {isLoading && !hasError && <div className="flex items-center justify-center h-full min-h-[300px]"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>}

              {hasError && (
                <div className="flex flex-col items-center justify-center gap-4 p-12 text-center h-full min-h-[300px]">
                  <AlertTriangle className="h-8 w-8 text-red-500" />
                  <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Gagal memuat preview</p>
                  <p className="text-xs text-zinc-400">{file.filename}</p>
                </div>
              )}

              {previewable === "image" && sUrl && !isLoadingToken && !hasError && <ImageViewer url={sUrl} filename={file.filename} />}
              {previewable === "video" && sUrl && !isLoadingToken && !hasError && <VideoPlayer url={sUrl} onClose={onClose} />}
              {previewable === "pdf" && sUrl && !isLoadingToken && !hasError && <PdfViewer url={sUrl} />}

              {previewable === "audio" && sUrl && !isLoadingToken && !hasError && (
                <div className="flex flex-col items-center justify-center gap-6 p-8 h-full min-h-[200px]">
                  <div className={`flex h-20 w-20 items-center justify-center rounded-2xl ${typeInfo!.bg}`}><Icon className={`h-10 w-10 ${color}`} /></div>
                  <audio src={sUrl} controls autoPlay className="w-full max-w-md" />
                </div>
              )}

              {previewable === "text" && !isLoadingText && !isTextError && (
                isEditing
                  ? <textarea value={textContent} onChange={(e) => setTextContent(e.target.value)} className="w-full h-full min-h-[400px] p-4 font-mono text-sm bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 border-0 outline-none resize-none" spellCheck={false} />
                  : <pre className="w-full h-full min-h-[400px] p-4 font-mono text-sm bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-auto whitespace-pre-wrap break-words">{textContent}</pre>
              )}

              {!previewable && !hasError && (
                <div className="flex flex-col items-center justify-center gap-4 p-12 text-center h-full min-h-[300px]">
                  <div className={`flex h-16 w-16 items-center justify-center rounded-2xl ${typeInfo!.bg}`}><Icon className={`h-8 w-8 ${color}`} /></div>
                  <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Preview tidak tersedia</p>
                  <p className="text-xs text-zinc-400 mt-1">{file.filename} ({formatBytes(file.sizeBytes)})</p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
