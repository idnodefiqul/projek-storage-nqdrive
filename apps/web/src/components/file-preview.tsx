import { useState, useEffect, useCallback, useRef, useId } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Save, Loader2, Maximize2, Minimize2, Edit3,
  AlertTriangle, Lock,
} from "lucide-react";
import { Button, Input, useToast } from "@nqdrive/ui";
import { usePreviewToken, useFileContent, useUpdateFileContent } from "../hooks/use-files";
import { getFileTypeInfo } from "../lib/file-icons";
import { formatBytes } from "@nqdrive/shared";
import { logoMainPng } from "../assets";
import type { FileWithAccount } from "@nqdrive/types";

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
    setPages([]);
    try {
      const pdfjs = await loadPdfJs();
      const loadingTask = pdfjs.getDocument({ url, password: pw || undefined, useSystemFonts: true });
      const pdf = await loadingTask.promise;
      setTotalPages(pdf.numPages);
      setNeedsPassword(false);
      setLoading(false);

      const scale = window.innerWidth < 768 ? 1.5 : 2;

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;
        const dataUrl = canvas.toDataURL("image/png");
        setPages(prev => [...prev, dataUrl]);
      }
    } catch (err: any) {
      if (err?.name === "PasswordException") {
        setNeedsPassword(true);
      } else {
        setError(err?.message || "Gagal memuat PDF");
      }
      setLoading(false);
    }
  }, [url]);

  useEffect(() => { renderPdf(); }, [renderPdf]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim()) renderPdf(password.trim());
  };

  if (loading && pages.length === 0) return <div className="flex items-center justify-center h-full min-h-[300px]"><Loader2 className="h-8 w-8 animate-spin keep-motion text-brand-500" /></div>;

  if (needsPassword) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px] p-6">
        <form onSubmit={handlePasswordSubmit} className="flex flex-col items-center gap-4 w-full max-w-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10">
            <Lock className="h-8 w-8 text-amber-500" />
          </div>
          <p className="text-sm font-semibold text-[rgb(var(--foreground))] dark:text-[rgb(var(--foreground))]">PDF dilindungi password</p>
          <p className="text-xs text-[rgb(var(--ink-500))] text-center">Masukkan password untuk membuka dokumen ini.</p>
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
      <p className="text-sm text-[rgb(var(--ink-500))] dark:text-[rgb(var(--ink-500))]">{error}</p>
    </div>
  );

  return (
    <div ref={containerRef} className="flex flex-col items-center gap-0 overflow-auto h-full bg-[rgb(var(--surface-muted))] dark:bg-[rgb(var(--surface))]">
      {pages.map((src, i) => (
        <div key={i} className="w-full max-w-3xl">
          <img src={src} alt={`Page ${i + 1}`} className="w-full h-auto bg-[rgb(var(--surface))] block" loading="lazy" />
        </div>
      ))}
      {pages.length < totalPages && pages.length > 0 && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
          <span className="ml-2 text-xs text-[rgb(var(--ink-500))]">Memuat halaman {pages.length + 1} / {totalPages}...</span>
        </div>
      )}
    </div>
  );
}

// Custom Video Player — streaming style, full-screen video with logo overlay

function VideoPlayer({ url, onClose }: { url: string; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [showUI, setShowUI] = useState(true);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [isBrowserFS, setIsBrowserFS] = useState(false);
  const [seekIndicator, setSeekIndicator] = useState<"left" | "right" | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapTime = useRef(0);
  const lastTapX = useRef(0);
  const seekIndicatorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const seekBy = (seconds: number) => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + seconds));
  };

  // Double-tap left/right to seek ±10s — no single-tap play/pause on screen
  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const now = Date.now();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const isLeft = x < rect.width / 2;

    if (now - lastTapTime.current < 350 && Math.abs(x - lastTapX.current) < 100) {
      // Double tap detected — seek
      if (isLeft) {
        seekBy(-10);
        setSeekIndicator("left");
      } else {
        seekBy(10);
        setSeekIndicator("right");
      }
      if (seekIndicatorTimer.current) clearTimeout(seekIndicatorTimer.current);
      seekIndicatorTimer.current = setTimeout(() => setSeekIndicator(null), 600);
      lastTapTime.current = 0;
    } else {
      // Single tap — just show/hide UI controls
      lastTapTime.current = now;
      lastTapX.current = x;
      setTimeout(() => {
        if (lastTapTime.current === now) resetHide();
      }, 350);
    }
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
    return () => { document.removeEventListener("fullscreenchange", onFSChange); if (hideTimer.current) clearTimeout(hideTimer.current); if (seekIndicatorTimer.current) clearTimeout(seekIndicatorTimer.current); };
  }, []);

  if (error) return (
    <div className="flex flex-col items-center justify-center gap-4 p-12 h-full min-h-[300px] bg-[rgb(var(--surface-muted))] dark:bg-[rgb(var(--surface))]">
      <AlertTriangle className="h-8 w-8 text-red-500" />
      <p className="text-sm text-[rgb(var(--ink-500))] dark:text-[rgb(var(--ink-500))]">Gagal memuat video</p>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-[rgb(var(--surface-muted))] dark:bg-[rgb(var(--surface))] flex items-center justify-center overflow-hidden cursor-pointer"
      onClick={handleContainerClick}
      onMouseMove={resetHide}
      onTouchStart={resetHide}
    >
      {/* Double-tap seek indicator */}
      <AnimatePresence>
        {seekIndicator && (
          <motion.div
            key={`seek-${seekIndicator}`}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.2 }}
            className={`absolute z-20 top-1/2 -translate-y-1/2 pointer-events-none ${seekIndicator === "left" ? "left-8 sm:left-16" : "right-8 sm:right-16"}`}
          >
            <div className="flex items-center gap-1 rounded-full bg-black/50 dark:bg-white/20 px-4 py-2 backdrop-blur-sm">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="currentColor">
                {seekIndicator === "left"
                  ? <path d="M12.5 3C7.81 3 4.01 6.54 3.67 11H1.5l3.5 4 3.5-4H6.17c.33-3.36 3.13-6 6.33-6 3.52 0 6.5 2.98 6.5 6.5S16.02 18 12.5 18c-1.56 0-2.99-.56-4.1-1.49l-1.42 1.42C8.53 19.35 10.43 20 12.5 20c4.69 0 8.5-3.81 8.5-8.5S17.19 3 12.5 3zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H11.5z" />
                  : <path d="M11.5 3c4.69 0 8.5 3.81 8.5 8.5s-3.81 8.5-8.5 8.5c-2.07 0-3.97-.65-5.52-1.07l1.42-1.42c1.11.93 2.54 1.49 4.1 1.49 3.52 0 6.5-2.98 6.5-6.5S15.02 5 11.5 5c-3.2 0-6 2.64-6.33 6H7.5l-3.5 4-3.5-4h2.17c.34-4.46 4.14-8 8.83-8zm1 5v5l-4.28 2.54-.72-1.21 3.5-2.08V8H12.5z" />
                }
              </svg>
              <span className="text-sm font-semibold text-white">10s</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading spinner — visible until video can play */}
      <AnimatePresence>
        {!videoLoaded && !error && (
          <motion.div
            key="video-loader"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[rgb(var(--surface-muted))] dark:bg-[rgb(var(--surface))] pointer-events-none"
          >
            <div className="h-10 w-10 rounded-full border-3 border-[rgb(var(--border-subtle))] dark:border-[rgb(var(--border-subtle))] border-t-brand-500 animate-spin keep-motion" />
            <span className="text-xs font-medium text-[rgb(var(--ink-500))] dark:text-[rgb(var(--ink-500))]">Memuat video...</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Video element — fills entire container */}
      <video
        ref={videoRef}
        src={url}
        playsInline
        autoPlay
        className="w-full h-full object-contain"
        onError={() => setError(true)}
        onTimeUpdate={handleTimeUpdate}
        onCanPlay={() => setVideoLoaded(true)}
        onLoadedMetadata={() => { if (videoRef.current) { setDuration(videoRef.current.duration); setIsPlaying(!videoRef.current.paused); } }}
        onPlay={() => { setIsPlaying(true); resetHide(); }}
        onPause={() => { setIsPlaying(false); setShowUI(true); }}
        onEnded={() => { setIsPlaying(false); setShowUI(true); }}
      />

      {/* Logo — top-left inside video, always visible */}
      <img src={logoMainPng} alt="" className="absolute top-4 left-4 h-8 sm:h-10 w-auto opacity-20 pointer-events-none select-none drop-shadow-lg" />

      {/* Center play icon — only when paused, tap bottom button to play */}
      <AnimatePresence>
        {!isPlaying && videoLoaded && (
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <div className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-black/30 dark:bg-white/15 backdrop-blur-sm">
              <svg viewBox="0 0 24 24" className="h-8 w-8 sm:h-10 sm:w-10 text-white ml-0.5" fill="currentColor"><polygon points="6,3 20,12 6,21" /></svg>
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
            className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/50 dark:from-black/70 to-transparent pt-3 pb-12 px-4 flex items-start justify-between pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div />
            <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 transition-colors backdrop-blur-sm">
              <X className="h-5 w-5 text-[rgb(var(--ink-500))] dark:text-white" />
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
            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 dark:from-black/80 via-black/30 dark:via-black/40 to-transparent pt-12 pb-4 px-4 pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Progress bar */}
            <div className="group cursor-pointer mb-3" onClick={handleSeek}>
              <div className="relative h-1 group-hover:h-2 transition-all rounded-full bg-[rgb(var(--surface-muted))]/40 dark:bg-white/20 overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-[rgb(var(--surface-muted))]/30 dark:bg-white/20 rounded-full transition-all" style={{ width: `${buffered}%` }} />
                <div className="absolute inset-y-0 left-0 bg-brand-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                <div className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-brand-500 shadow-md opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: `calc(${progress}% - 6px)` }} />
              </div>
            </div>

            {/* Controls row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button type="button" onClick={togglePlay} aria-label={isPlaying ? "Jeda video" : "Putar video"} className="text-[rgb(var(--foreground))] dark:text-white hover:text-brand-500 dark:hover:text-brand-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded">
                  {isPlaying ? (
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor"><polygon points="6,3 20,12 6,21" /></svg>
                  )}
                </button>
                <span className="text-sm text-[rgb(var(--ink-500))]/90 dark:text-white/90 font-mono tabular-nums">{fmt(currentTime)} <span className="text-[rgb(var(--ink-500))] dark:text-white/40">/</span> {fmt(duration)}</span>
              </div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={toggleFS} aria-label={isBrowserFS ? "Keluar fullscreen" : "Masuk fullscreen"} className="text-[rgb(var(--ink-500))] dark:text-white/80 hover:text-[rgb(var(--foreground))] dark:hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded" title="Fullscreen">
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
      <p className="text-sm text-[rgb(var(--ink-500))] dark:text-[rgb(var(--ink-500))]">Gagal memuat gambar</p>
    </div>
  );

  return (
    <div className="flex items-start justify-center h-full w-full bg-[rgb(var(--surface-muted))] dark:bg-[rgb(var(--surface))] p-0 overflow-y-auto overflow-x-hidden">
      <img
        src={url}
        alt={filename}
        className="w-full h-auto object-contain select-none"
        onError={() => setError(true)}
        draggable={false}
      />
    </div>
  );
}

// ── Main Dialog ──

interface Props { file: FileWithAccount | null; onClose: () => void; }

export function FilePreviewDialog({ file, onClose }: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const typeInfo = file ? getFileTypeInfo(file.filename) : null;
  const previewable = typeInfo?.previewable;

  const needsStream = !!file && (previewable === "image" || previewable === "video" || previewable === "audio" || previewable === "pdf");
  const needsText = !!file && previewable === "text";

  const { data: tokenData, isLoading: isLoadingToken, isError: isTokenError } = usePreviewToken(needsStream ? file!.slug : null);
  const { data: textData, isLoading: isLoadingText, isError: isTextError } = useFileContent(needsText ? file!.slug : null);
  const updateContent = useUpdateFileContent();

  const [textContent, setTextContent] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  // Default full-screen di mobile (< 640px), windowed di desktop
  const [isFullscreen, setIsFullscreen] = useState(() => typeof window !== "undefined" && window.innerWidth < 640);

  useEffect(() => { if (textData?.content !== undefined) setTextContent(textData.content); }, [textData?.content]);
  useEffect(() => { if (!file) { setIsEditing(false); } }, [file]);
  useEffect(() => {
    if (!file) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      const container = panelRef.current;
      if (!container) return;
      const focusable = getFocusable(container);
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
    document.addEventListener("keydown", handleKey, true);
    requestAnimationFrame(() => {
      const c = panelRef.current;
      if (!c) return;
      const f = getFocusable(c);
      f[0]?.focus();
    });
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [file, onClose]);

  const handleSaveText = useCallback(async () => {
    if (!file) return;
    try { await updateContent.mutateAsync({ slug: file.slug, content: textContent }); setIsEditing(false); toast({ title: "File berhasil disimpan", variant: "success" }); }
    catch (e) { toast({ title: "Gagal menyimpan", description: e instanceof Error ? e.message : undefined, variant: "error" }); }
  }, [file, textContent, updateContent, toast]);

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
          className="fixed inset-0 z-[9999] bg-[rgb(var(--surface-muted))] dark:bg-[rgb(var(--surface))]">
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
          className="fixed inset-0 z-[9999] bg-[rgb(var(--surface-muted))] dark:bg-[rgb(var(--surface))] flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-brand-500" />
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      {file && (
        <motion.div key="preview-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }} onClick={(e) => e.stopPropagation()}
            className={`relative flex flex-col bg-[rgb(var(--surface))] dark:bg-[rgb(var(--surface))] shadow-2xl border border-[rgb(var(--border-subtle))] dark:border-[rgb(var(--border-subtle))] overflow-hidden focus:outline-none ${isFullscreen ? "w-full h-full rounded-none" : "w-full max-w-4xl max-h-[90vh] rounded-2xl"}`}>

            {/* Header — no rename, just filename + controls */}
            <div className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-[rgb(var(--border-subtle))] dark:border-[rgb(var(--border-subtle))] shrink-0">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${typeInfo!.bg}`}><Icon className={`h-4 w-4 ${color}`} /></div>
              <div className="flex-1 min-w-0">
                <p id={titleId} className="text-sm font-semibold text-[rgb(var(--foreground))] dark:text-[rgb(var(--foreground))] truncate">{file.filename}</p>
                <p className="text-xs text-[rgb(var(--ink-500))] mt-0.5">{formatBytes(file.sizeBytes)} {"\u00B7"} {typeInfo!.label}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {previewable === "text" && !isEditing && <Button size="icon" variant="ghost" onClick={() => setIsEditing(true)} className="h-8 w-8" title="Edit" aria-label="Edit file"><Edit3 className="h-4 w-4" aria-hidden="true" /></Button>}
                {previewable === "text" && isEditing && <Button size="icon" variant="ghost" onClick={handleSaveText} disabled={updateContent.isPending} className="h-8 w-8" title="Simpan" aria-label="Simpan perubahan">{updateContent.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4 text-brand-500" aria-hidden="true" />}</Button>}
                {/* Fullscreen toggle — visible on both mobile and desktop */}
                <Button size="icon" variant="ghost" onClick={() => setIsFullscreen(v => !v)} className="h-8 w-8" title={isFullscreen ? "Kecilkan" : "Perbesar"} aria-label={isFullscreen ? "Kecilkan tampilan" : "Perbesar tampilan"}>{isFullscreen ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}</Button>
                <Button size="icon" variant="ghost" onClick={onClose} className="h-8 w-8" title="Tutup" aria-label="Tutup preview"><X className="h-4 w-4" aria-hidden="true" /></Button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto min-h-0">
              {isLoading && !hasError && <div className="flex items-center justify-center h-full min-h-[300px]"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>}

              {hasError && (
                <div className="flex flex-col items-center justify-center gap-4 p-12 text-center h-full min-h-[300px]">
                  <AlertTriangle className="h-8 w-8 text-red-500" />
                  <p className="text-sm font-medium text-[rgb(var(--ink-500))] dark:text-[rgb(var(--ink-500))]">Gagal memuat preview</p>
                  <p className="text-xs text-[rgb(var(--ink-500))]">{file.filename}</p>
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
                  ? <textarea value={textContent} onChange={(e) => setTextContent(e.target.value)} className="w-full h-full min-h-[400px] p-4 font-mono text-sm bg-[rgb(var(--surface-muted))] dark:bg-[rgb(var(--surface))] text-[rgb(var(--foreground))] dark:text-[rgb(var(--foreground))] border-0 outline-none resize-none" spellCheck={false} />
                  : <pre className="w-full h-full min-h-[400px] p-4 font-mono text-sm bg-[rgb(var(--surface-muted))] dark:bg-[rgb(var(--surface))] text-[rgb(var(--foreground))] dark:text-[rgb(var(--foreground))] overflow-auto whitespace-pre-wrap break-words">{textContent}</pre>
              )}

              {!previewable && !hasError && (
                <div className="flex flex-col items-center justify-center gap-4 p-12 text-center h-full min-h-[300px]">
                  <div className={`flex h-16 w-16 items-center justify-center rounded-2xl ${typeInfo!.bg}`}><Icon className={`h-8 w-8 ${color}`} /></div>
                  <p className="text-sm font-medium text-[rgb(var(--ink-500))] dark:text-[rgb(var(--ink-500))]">Preview tidak tersedia</p>
                  <p className="text-xs text-[rgb(var(--ink-500))] mt-1">{file.filename} ({formatBytes(file.sizeBytes)})</p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
