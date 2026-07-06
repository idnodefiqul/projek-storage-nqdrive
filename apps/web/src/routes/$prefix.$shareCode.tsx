import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Download, ShieldCheck, FileText, FileArchive, FileImage,
  FileAudio, FileVideo, FileCode, File as FileIcon,
  Activity, Loader2, Gauge, CheckCircle2,
  Zap, UserX, RefreshCw, Sparkles, Home, Shield, Globe2, Menu, X, Share2, Copy, Link2, Mail, Send, MessageCircle, Moon, Sun, CircleX,
} from "lucide-react";
import { motion } from "framer-motion";
import { Button, Dialog, DialogContent, Particles } from "@nqdrive/ui";
import { formatBytes } from "@nqdrive/shared";
import { logoMainPng } from "../assets";
import QRCode from "qrcode";
import { applyBrandColors, applyBrandFromDb, useTheme } from "../stores/theme-provider";

export const Route = createFileRoute("/$prefix/$shareCode")({
  component: DownloadPage,
});

interface FileInfoData {
  filename: string;
  sizeBytes: number;
  mimeType: string;
  slug: string;
  downloadCount: number;
}

interface PublicConfig {
  brand_color: string;
  theme_mode: string;
}

const SITE_NAME = (import.meta.env.VITE_SITE_NAME as string) || "NQDRIVE";
function getFileTypeIcon(mime: string) {
  const m = mime.toLowerCase();
  if (m.includes("zip") || m.includes("rar") || m.includes("tar") || m.includes("gzip") || m.includes("7z")) {
    return <FileArchive className="h-11 w-11 text-blue-500" />;
  }
  if (m.includes("image")) {
    return <FileImage className="h-11 w-11 text-emerald-500" />;
  }
  if (m.includes("audio")) {
    return <FileAudio className="h-11 w-11 text-violet-500" />;
  }
  if (m.includes("video")) {
    return <FileVideo className="h-11 w-11 text-rose-500" />;
  }
  if (m.includes("code") || m.includes("javascript") || m.includes("json") || m.includes("html") || m.includes("css") || m.includes("text/plain")) {
    return <FileCode className="h-11 w-11 text-amber-500" />;
  }
  if (m.includes("pdf") || m.includes("document") || m.includes("word") || m.includes("excel") || m.includes("powerpoint") || m.includes("officedocument")) {
    return <FileText className="h-11 w-11 text-red-500" />;
  }
  return <FileIcon className="h-11 w-11 text-zinc-400 dark:text-zinc-500" />;
}

function getFileTypeLabel(mime: string) {
  const m = mime.toLowerCase();
  if (m.includes("zip") || m.includes("rar") || m.includes("tar") || m.includes("gzip") || m.includes("7z")) return "Archive";
  if (m.includes("image")) return "Image";
  if (m.includes("audio")) return "Audio";
  if (m.includes("video")) return "Video";
  if (m.includes("pdf")) return "PDF Document";
  if (m.includes("word") || m.includes("document")) return "Document";
  if (m.includes("excel") || m.includes("spreadsheet")) return "Spreadsheet";
  if (m.includes("powerpoint") || m.includes("presentation")) return "Presentation";
  if (m.includes("javascript") || m.includes("json") || m.includes("html") || m.includes("css") || m.includes("code")) return "Code";
  if (m.includes("text/plain")) return "Text";
  const sub = mime.split("/")[1];
  return sub ? sub.toUpperCase() : "File";
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

const FEATURES = [
  { icon: Zap, title: "Fast & Secure", desc: "Transfer berkecepatan tinggi melalui koneksi terenkripsi." },
  { icon: ShieldCheck, title: "Safe Files", desc: "Setiap file dipindai dan diverifikasi sebelum tersedia." },
  { icon: UserX, title: "No Registration", desc: "Unduh langsung tanpa perlu membuat akun." },
  { icon: RefreshCw, title: "Resume Support", desc: "Lanjutkan unduhan yang terputus tanpa mengulang." },
];

function DownloadPage() {
  const { prefix, shareCode } = Route.useParams();
  const [fileInfo, setFileInfo] = useState<FileInfoData | null>(null);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const { theme, toggleTheme } = useTheme();

  const WORKER_BASE = (import.meta.env.VITE_WORKER_URL as string | undefined) ?? "";

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch(`${WORKER_BASE}/config`, { headers: { "X-App-Client": "nqdrive-web" } })
      .then((res) => res.json())
      .then((json: any) => {
        if (json.success && json.data) {
          const cfg = json.data as PublicConfig;
          setConfig(cfg);
          if (cfg.theme_mode === "dark" || cfg.theme_mode === "light") {
            applyBrandFromDb(cfg.brand_color, cfg.theme_mode);
          } else if (cfg.brand_color) {
            applyBrandColors(cfg.brand_color);
          }
        }
      })
      .catch(console.error);

    fetch(`${WORKER_BASE}/resource/${prefix}/${shareCode}`, { headers: { "X-App-Client": "nqdrive-web" } })
      .then((res) => {
        if (!res.ok) throw new Error("File tidak ditemukan atau link sudah tidak aktif.");
        return res.json();
      })
      .then((json: any) => {
        if (json.success && json.data) setFileInfo(json.data);
        else throw new Error("Gagal mengambil informasi file.");
      })
      .catch((err) => setError(err.message || "Gagal memuat file."))
      .finally(() => setLoading(false));
  }, [shareCode, prefix, WORKER_BASE]);


  useEffect(() => {
    if (!shareOpen) return;
    QRCode.toDataURL(window.location.href, { width: 220, margin: 2 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [shareOpen]);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);
  const handleDownload = async () => {
    if (!fileInfo || downloading) return;
    setDownloading(true);

    try {
      const res = await fetch(`${WORKER_BASE}/resource/${prefix}/${shareCode}/getlinkUrl`, {
        headers: { "X-App-Client": "nqdrive-web" },
      });
      const json = await res.json() as any;
      if (!res.ok || !json.success || !json.data?.downloadUrl) {
        throw new Error(json.error?.message || "Gagal mendapatkan link download.");
      }

      const a = document.createElement("a");
      a.href = json.data.downloadUrl;
      a.download = fileInfo.filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e: any) {
      alert(e.message || "Gagal mendapatkan link download.");
    } finally {
      setTimeout(() => setDownloading(false), 1500);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
          <p className="text-sm font-medium text-zinc-500 animate-pulse">Menyiapkan unduhan...</p>
        </div>
      </div>
    );
  }



  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const encodedShareUrl = encodeURIComponent(shareUrl);
  const encodedShareText = encodeURIComponent(fileInfo?.filename ?? SITE_NAME);
  const copyShareLink = async () => {
    await navigator.clipboard.writeText(shareUrl);
  };
  const isFileMissing = !!error || !fileInfo;

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-hidden bg-zinc-50 selection:bg-brand-500/30 dark:bg-zinc-950">
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
            <motion.div variants={item}>
              <Link to="/" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                <Home className="h-6 w-6 text-brand-500" /> Home
              </Link>
            </motion.div>
            <motion.div variants={item}>
              <Link to="/privacy-policy" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                <Shield className="h-6 w-6 text-brand-500" /> Privacy Policy
              </Link>
            </motion.div>
            <motion.div variants={item} className="pt-6 border-t border-zinc-200 dark:border-zinc-800">
              <button onClick={() => { toggleTheme(); setMobileMenuOpen(false); }} className="flex w-full items-center gap-3 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {theme === "light" ? <Moon className="h-6 w-6 text-brand-500" /> : <Sun className="h-6 w-6 text-brand-500" />}
                {theme === "light" ? "Dark Mode" : "Light Mode"}
              </button>
            </motion.div>
          </motion.nav>
        </div>
      )}

      {/* Share Modal */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen} className="max-w-md p-0 overflow-hidden">
        <div className="bg-white dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-100 p-4 dark:border-zinc-800/60">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">Bagikan File</h3>
            <Button variant="ghost" size="icon" onClick={() => setShareOpen(false)} className="h-8 w-8 rounded-full">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="p-6">
            <div className="mb-6 flex flex-col items-center justify-center gap-3">
              {qrDataUrl ? (
                <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
                  <img src={qrDataUrl} alt="QR Code" className="h-40 w-40 rounded-lg" />
                </div>
              ) : (
                <div className="h-40 w-40 rounded-xl bg-zinc-100 animate-pulse dark:bg-zinc-800" />
              )}
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Scan QR Code untuk membuka</p>
            </div>
            
            <div className="mb-6 grid grid-cols-4 gap-3">
              <a href={`https://wa.me/?text=${encodedShareText}%0A${encodedShareUrl}`} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1.5 transition-transform hover:scale-105">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366]/10 text-[#25D366]">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-400">WhatsApp</span>
              </a>
              <a href={`https://t.me/share/url?url=${encodedShareUrl}&text=${encodedShareText}`} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1.5 transition-transform hover:scale-105">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0088cc]/10 text-[#0088cc]">
                  <Send className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-400">Telegram</span>
              </a>
              <a href={`https://twitter.com/intent/tweet?url=${encodedShareUrl}&text=${encodedShareText}`} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1.5 transition-transform hover:scale-105">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900/5 text-zinc-900 dark:bg-white/10 dark:text-white">
                  <X className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-400">X / Twitter</span>
              </a>
              <a href={`mailto:?subject=${encodedShareText}&body=${encodedShareUrl}`} className="flex flex-col items-center gap-1.5 transition-transform hover:scale-105">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                  <Mail className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-400">Email</span>
              </a>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-1.5 pr-2 dark:border-zinc-800 dark:bg-zinc-900/50">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-zinc-400 shadow-sm dark:bg-zinc-800">
                <Link2 className="h-4 w-4" />
              </div>
              <input type="text" readOnly value={shareUrl} className="flex-1 bg-transparent px-2 text-xs text-zinc-600 outline-none dark:text-zinc-300" />
              <Button onClick={copyShareLink} size="sm" className="h-8 shrink-0 rounded-md px-3 text-xs">
                Copy
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
      {/* Main Content */}
      <main className="relative z-10 flex flex-1 flex-col items-center px-4 pb-8 pt-24 sm:px-6 sm:pb-12">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="w-full max-w-5xl space-y-6"
        >
          <motion.div variants={item}>
            <div className="grid grid-cols-1 gap-6 rounded-2xl border border-brand-200/60 bg-white/95 p-6 shadow-lg shadow-brand-500/5 dark:border-white/10 dark:bg-zinc-900/95 sm:p-8 lg:grid-cols-[auto_1fr_320px] lg:items-center">
              {isFileMissing ? (
                <>
                  <div className="flex justify-center lg:justify-start">
                    <div className="flex h-24 w-24 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/40">
                      <CircleX className="h-11 w-11 text-red-500 dark:text-red-400" />
                    </div>
                  </div>

                  <div className="min-w-0 text-center lg:text-left">
                    <h1 className="line-clamp-2 break-words text-xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-2xl">
                      File Not Found
                    </h1>
                    <p className="mt-1.5 max-w-xl text-sm font-medium leading-relaxed text-zinc-500 dark:text-zinc-400">
                      The file you are looking for may have been removed, expired, or the download link is invalid.
                    </p>
                  </div>

                  <div className="rounded-xl border border-brand-200/70 bg-white/70 p-5 shadow-sm dark:border-brand-500/20 dark:bg-zinc-950/40">
                    <Link
                      to="/"
                      className="group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-brand-500 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600"
                    >
                      <Home className="h-5 w-5 transition-transform group-hover:-translate-y-0.5" />
                      Go to Homepage
                      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
                    </Link>
                  </div>
                </>
              ) : fileInfo ? (
                <>
                  {/* Icon file besar (kiri) */}
                  <div className="flex justify-center lg:justify-start">
                    <div className="flex h-24 w-24 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/40">
                      {getFileTypeIcon(fileInfo.mimeType)}
                    </div>
                  </div>

                  {/* Informasi file (tengah) */}
                  <div className="min-w-0 text-center lg:text-left">
                    <h1 className="line-clamp-2 break-words text-xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-2xl" title={fileInfo.filename}>
                      {fileInfo.filename}
                    </h1>
                    <p className="mt-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400">
                      {formatBytes(fileInfo.sizeBytes)}
                    </p>

                    <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" />
                      File is safe and ready to download
                    </div>

                    <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:max-w-sm lg:mx-0">
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">File Type</dt>
                        <dd className="font-semibold text-zinc-800 dark:text-zinc-200">{getFileTypeLabel(fileInfo.mimeType)}</dd>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Size</dt>
                        <dd className="font-semibold text-zinc-800 dark:text-zinc-200">{formatBytes(fileInfo.sizeBytes)}</dd>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Downloads</dt>
                        <dd className="font-semibold text-zinc-800 dark:text-zinc-200">{fileInfo.downloadCount}x</dd>
                      </div>
                    </dl>
                  </div>

                  {/* Card Download (kanan) */}
                  <div className="rounded-xl border border-brand-200/70 bg-white/70 p-5 shadow-sm dark:border-brand-500/20 dark:bg-zinc-950/40">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-base font-bold text-zinc-900 dark:text-white">Premium Download</h2>
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-brand-700 dark:bg-brand-500/20 dark:text-brand-200 dark:ring-1 dark:ring-brand-500/30">
                        <Sparkles className="h-3 w-3" /> Premium
                      </span>
                    </div>
                    <div className="mb-4 space-y-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                          <Activity className="h-4 w-4" /> Bandwidth Limit
                        </span>
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                          Unlimited
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                          <Gauge className="h-4 w-4" /> Download Speed
                        </span>
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">Unlimited</span>
                      </div>
                    </div>

                    <motion.button
                      onClick={handleDownload}
                      disabled={downloading}
                      whileHover={{ scale: downloading ? 1 : 1.02 }}
                      whileTap={{ scale: downloading ? 1 : 0.97 }}
                      className="group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-brand-500 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 disabled:pointer-events-none disabled:opacity-90"
                    >
                      {downloading ? (
                        <><Loader2 className="h-5 w-5 animate-spin" /> Mengunduh...</>
                      ) : (
                        <><Download className="h-5 w-5 transition-transform group-hover:-translate-y-0.5" /> Download</>
                      )}
                      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
                    </motion.button>

                    <Button variant="outline" size="sm" onClick={() => setShareOpen(true)} className="mt-3 w-full justify-center gap-2 border-brand-200 text-brand-700 hover:bg-brand-50 hover:text-brand-800 dark:border-brand-500/30 dark:text-brand-300 dark:hover:bg-brand-900/30">
                      <Share2 className="h-4 w-4" /> Share
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          </motion.div>

          <motion.div variants={item}>
            <div className="flex flex-col gap-4 rounded-2xl border border-brand-200/60 bg-white/95 p-6 shadow-lg shadow-brand-500/5 dark:border-white/10 dark:bg-zinc-900/95 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-white">Premium Download</h3>
                  <p className="mt-0.5 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
                    Premium unlimited access is active for this file. Downloads run without quota limits, registration, or artificial speed caps.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:shrink-0">
                <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800/30">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 dark:text-zinc-500">
                    <Gauge className="h-3.5 w-3.5" /> Download Speed
                  </div>
                  <div className="mt-1 text-sm font-bold text-zinc-800 dark:text-zinc-200">
                    Unlimited
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800/30">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 dark:text-zinc-500">
                    <Activity className="h-3.5 w-3.5" /> Bandwidth Limit
                  </div>
                  <div className="mt-1 text-sm font-bold text-zinc-800 dark:text-zinc-200">
                    Unlimited
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div variants={item} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <motion.div
                key={title}
                whileHover={{ y: -4 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="rounded-xl border border-zinc-200/80 bg-white/80 p-5 shadow-sm transition-shadow hover:shadow-md dark:border-white/10 dark:bg-zinc-900/80"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400">
                  <Icon className="h-5 w-5" />
                </div>
                <h4 className="text-sm font-bold text-zinc-900 dark:text-white">{title}</h4>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{desc}</p>
              </motion.div>
            ))}
          </motion.div>
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
            <span>Unlimited Premium Access</span>
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            &copy; {new Date().getFullYear()} {SITE_NAME}. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default DownloadPage;
