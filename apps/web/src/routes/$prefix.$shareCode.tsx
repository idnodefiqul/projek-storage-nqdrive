import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Download, ShieldCheck, FileText, FileArchive, FileImage,
  FileAudio, FileVideo, FileCode, File as FileIcon,
  HardDrive, Link2, Flag, ArrowLeft, Loader2, 
  Share2, MessageCircle, Send, Mail, X
} from "lucide-react";
import { motion } from "framer-motion";
import { Dialog, GridPattern } from "@nqdrive/ui";
import { formatBytes } from "@nqdrive/shared";
import { logoMainPng } from "../assets";
import QRCode from "qrcode";
import { useTheme } from "../stores/theme-provider";

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

const SITE_NAME = (import.meta.env.VITE_SITE_NAME as string) || "NQDRIVE";

function getFileTypeIcon(mime: string) {
  const m = mime.toLowerCase();
  const iconClass = "h-12 w-12 md:h-16 md:w-16 drop-shadow-[0_0_15px_rgba(59,130,246,0.3)]";
  
  if (m.includes("zip") || m.includes("rar") || m.includes("tar") || m.includes("gzip") || m.includes("7z")) {
    return <FileArchive className={`${iconClass} text-blue-400`} />;
  }
  if (m.includes("image")) {
    return <FileImage className={`${iconClass} text-emerald-400`} />;
  }
  if (m.includes("audio")) {
    return <FileAudio className={`${iconClass} text-violet-400`} />;
  }
  if (m.includes("video")) {
    return <FileVideo className={`${iconClass} text-rose-400`} />;
  }
  if (m.includes("code") || m.includes("javascript") || m.includes("json") || m.includes("html") || m.includes("css") || m.includes("text/plain")) {
    return <FileCode className={`${iconClass} text-amber-400`} />;
  }
  if (m.includes("pdf") || m.includes("document") || m.includes("word") || m.includes("excel") || m.includes("powerpoint") || m.includes("officedocument")) {
    return <FileText className={`${iconClass} text-red-400`} />;
  }
  return <FileIcon className={`${iconClass} text-zinc-400`} />;
}

function getFileTypeLabel(mime: string) {
  const m = mime.toLowerCase();
  if (m.includes("zip") || m.includes("rar") || m.includes("tar") || m.includes("gzip") || m.includes("7z")) return "Archive";
  if (m.includes("image")) return "Image";
  if (m.includes("audio")) return "Audio";
  if (m.includes("video")) return "Video";
  if (m.includes("pdf")) return "PDF";
  if (m.includes("word") || m.includes("document")) return "Document";
  if (m.includes("excel") || m.includes("spreadsheet")) return "Spreadsheet";
  if (m.includes("powerpoint") || m.includes("presentation")) return "Presentation";
  if (m.includes("javascript") || m.includes("json") || m.includes("html") || m.includes("css") || m.includes("code")) return "Code";
  if (m.includes("text/plain")) return "Text";
  const sub = mime.split("/")[1];
  return sub ? sub.toUpperCase() : "FILE";
}

function DownloadPage() {
  const { prefix, shareCode } = Route.useParams();
  const [fileInfo, setFileInfo] = useState<FileInfoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  
  const [shareOpen, setShareOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const { theme } = useTheme();

  const WORKER_BASE = (import.meta.env.VITE_WORKER_URL as string | undefined) ?? "";

  useEffect(() => {
    setLoading(true);
    setError(null);

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
    if (!fileInfo) return;

    const fileType = getFileTypeLabel(fileInfo.mimeType);
    const fileSize = formatBytes(fileInfo.sizeBytes);
    const pageTitle = `Download ${fileInfo.filename} - ${SITE_NAME}`;
    const pageDesc = `Unduh file ${fileInfo.filename} (${fileSize}). Tipe File: ${fileType}. Dibagikan secara aman melalui ${SITE_NAME} Gateway.`;

    document.title = pageTitle;

    const setMetaTag = (attr: string, key: string, content: string) => {
      let element = document.querySelector(`meta[${attr}="${key}"]`);
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attr, key);
        document.head.appendChild(element);
      }
      element.setAttribute('content', content);
    };

    setMetaTag('name', 'description', pageDesc);
    setMetaTag('property', 'og:title', pageTitle);
    setMetaTag('property', 'og:description', pageDesc);
    setMetaTag('property', 'og:type', 'website');
    setMetaTag('property', 'og:url', window.location.href);
    setMetaTag('name', 'twitter:card', 'summary');
    setMetaTag('name', 'twitter:title', pageTitle);
    setMetaTag('name', 'twitter:description', pageDesc);

  }, [fileInfo]);

  useEffect(() => {
    if (!shareOpen) return;
    QRCode.toDataURL(window.location.href, { width: 220, margin: 2 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [shareOpen]);

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
      setTimeout(() => setDownloading(false), 2000);
    }
  };

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const encodedShareUrl = encodeURIComponent(shareUrl);
  const encodedShareText = encodeURIComponent(fileInfo?.filename ?? SITE_NAME);

  const copyShareLink = async () => {
    await navigator.clipboard.writeText(shareUrl);
    alert("Tautan berhasil disalin!");
  };

  const isFileMissing = !!error || !fileInfo;

  return (
    <>
      <style>
        {`
          @keyframes soft-pulse {
            0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
            70% { box-shadow: 0 0 0 15px rgba(59, 130, 246, 0); }
            100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
          }
          .icon-pulse { animation: soft-pulse 2.5s infinite; }
        `}
      </style>
      
      <div className="relative min-h-screen flex items-center justify-center p-4 sm:p-6 md:p-8 bg-slate-100 dark:bg-zinc-950 font-sans text-slate-900 dark:text-slate-100 overflow-hidden">
        <GridPattern
          width={30}
          height={30}
          className="[mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)] text-slate-300 dark:text-zinc-700"
          strokeDasharray="2 2"
        />
        
        {loading ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
            <p className="text-sm font-medium text-slate-500 animate-pulse">Memuat informasi file...</p>
          </div>
        ) : isFileMissing ? (
          <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-md p-8 text-center shadow-xl">
            <h1 className="text-2xl font-bold mb-2">File Tidak Ditemukan</h1>
            <p className="text-slate-500 mb-6">{error || "File mungkin telah dihapus atau kadaluarsa."}</p>
            <Link to="/" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-semibold transition-all">
              <ArrowLeft className="h-5 w-5" /> Kembali ke Beranda
            </Link>
          </div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="max-w-4xl w-full bg-white dark:bg-zinc-900 rounded-md overflow-hidden shadow-[0_20px_50px_rgba(8,112,184,0.07)] dark:shadow-none dark:border dark:border-zinc-800 flex flex-col md:flex-row relative"
          >
            
            {/* Panel Kiri - Identitas File */}
            <div 
              className="w-full md:w-5/12 p-6 sm:p-8 md:p-12 flex flex-col items-center justify-center relative min-h-[220px] md:min-h-[300px]"
              style={{
                backgroundColor: '#0f172a',
                backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px)',
                backgroundSize: '20px 20px'
              }}
            >
              <Link to="/" className="absolute top-4 left-4 md:top-6 md:left-6 transition-opacity hover:opacity-80">
                <img src={logoMainPng} alt={SITE_NAME} className="h-5 md:h-7 w-auto object-contain brightness-0 invert" />
              </Link>

              <div className="w-20 h-20 md:w-32 md:h-32 rounded-md bg-slate-800 border-2 border-slate-700 flex items-center justify-center mb-4 md:mb-6 icon-pulse z-10 relative mt-6 md:mt-0">
                {getFileTypeIcon(fileInfo.mimeType)}
                <div className="absolute -bottom-2 -right-2 bg-blue-600 text-white text-[10px] md:text-xs font-bold px-2 py-1 md:px-3 md:py-1.5 rounded-sm shadow-lg">
                  {getFileTypeLabel(fileInfo.mimeType)}
                </div>
              </div>

              <h2 className="text-lg md:text-2xl text-white font-bold text-center z-10 mb-2 leading-tight break-all line-clamp-3">
                {fileInfo.filename}
              </h2>
              
              <div className="bg-slate-800/80 backdrop-blur-sm text-slate-300 text-xs md:text-sm font-medium px-3 py-1.5 md:px-4 md:py-2 rounded-sm z-10 mt-1 md:mt-2 border border-slate-700 flex items-center gap-2">
                <HardDrive className="h-3.5 w-3.5" /> {formatBytes(fileInfo.sizeBytes)}
              </div>
            </div>

            {/* Panel Kanan - Detail dan Aksi */}
            <div className="w-full md:w-7/12 p-6 sm:p-8 md:p-12 flex flex-col justify-between">
              
              <div>
                <div className="flex items-center gap-2 mb-4 md:mb-6">
                  <span className="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 text-[10px] md:text-xs font-bold px-2 py-1 md:px-3 md:py-1 rounded-sm uppercase tracking-wider border border-emerald-100 dark:border-emerald-500/20 flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 md:h-4 md:w-4" /> Bebas Virus
                  </span>
                  <span className="text-slate-400 text-xs font-medium">Scanned by {SITE_NAME}</span>
                </div>

                <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white mb-2 md:mb-4 tracking-tight">
                  Siap Diunduh
                </h1>
                <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-sm">
                  Anda akan mengunduh file yang dibagikan secara publik melalui <strong className="text-slate-800 dark:text-slate-200">{SITE_NAME} Gateway</strong>.
                </p>
              </div>

              {/* Kotak Informasi Ekstra */}
              <div className="my-6 md:my-8 bg-slate-50 dark:bg-zinc-800/50 rounded-md p-4 md:p-5 border border-slate-100 dark:border-zinc-800">
                <div className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-zinc-700">
                  <span className="text-slate-500 dark:text-slate-400 text-xs md:text-sm flex items-center"><FileText className="h-4 w-4 mr-2"/>Tipe File</span>
                  <span className="text-slate-800 dark:text-slate-200 font-semibold text-xs md:text-sm">{getFileTypeLabel(fileInfo.mimeType)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-zinc-700 mt-1 md:mt-2">
                  <span className="text-slate-500 dark:text-slate-400 text-xs md:text-sm flex items-center"><HardDrive className="h-4 w-4 mr-2"/>Ukuran</span>
                  <span className="text-slate-800 dark:text-slate-200 font-semibold text-xs md:text-sm">{formatBytes(fileInfo.sizeBytes)}</span>
                </div>
                <div className="flex justify-between items-center py-2 mt-1 md:mt-2">
                  <span className="text-slate-500 dark:text-slate-400 text-xs md:text-sm flex items-center"><Download className="h-4 w-4 mr-2"/>Total Unduhan</span>
                  <span className="text-slate-800 dark:text-slate-200 font-semibold text-xs md:text-sm">{fileInfo.downloadCount} Kali</span>
                </div>
              </div>

              {/* Bagian Tombol Aksi (Dipisah antara Download dan Share) */}
              <div className="relative mt-auto flex flex-col gap-3 md:gap-4 justify-end">
                
                {/* Area Tombol Download (Akan berubah jadi animasi saat loading) */}
                <div className="w-full">
                  {downloading ? (
                    <div className="w-full bg-blue-50 dark:bg-zinc-800/80 text-blue-600 dark:text-blue-400 h-12 md:h-14 rounded-md flex items-center justify-center gap-3 border border-blue-100 dark:border-zinc-700 transition-all duration-300">
                      <Loader2 className="h-5 w-5 md:h-6 md:w-6 animate-spin" />
                      <span className="text-sm md:text-base font-bold">Menyiapkan Unduhan...</span>
                    </div>
                  ) : (
                    <button 
                      onClick={handleDownload}
                      className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-base md:text-lg font-bold h-12 md:h-14 rounded-md shadow-[0_8px_20px_rgba(37,99,235,0.2)] hover:shadow-[0_10px_25px_rgba(37,99,235,0.3)] transition-all flex items-center justify-center gap-2 md:gap-3 transform hover:-translate-y-0.5"
                    >
                      <Download className="h-5 w-5 md:h-6 md:w-6" />
                      <span>Downloads</span>
                    </button>
                  )}
                </div>

                {/* Area Tombol Share dan Laporan (Akan terus terlihat) */}
                <div className="flex gap-2 md:gap-3">
                  <button onClick={() => setShareOpen(true)} className="flex-1 bg-white dark:bg-zinc-900 border-2 border-slate-100 dark:border-zinc-800 hover:border-slate-200 dark:hover:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-slate-300 h-11 md:h-12 rounded-md font-semibold transition-all flex items-center justify-center gap-2 text-xs md:text-sm">
                    <Share2 className="h-4 w-4" /> Bagikan File
                  </button>
                  <button onClick={() => alert("Laporan diterima.")} className="flex-none bg-white dark:bg-zinc-900 border-2 border-slate-100 dark:border-zinc-800 hover:border-red-100 hover:bg-red-50 hover:text-red-600 text-slate-500 h-11 md:h-12 px-4 md:px-5 rounded-md transition-all flex items-center justify-center">
                    <Flag className="h-4 w-4 md:h-5 md:w-5" />
                  </button>
                </div>

              </div>
              
            </div>
          </motion.div>
        )}
      </div>

      {/* Share Modal */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen} className="max-w-md p-0 overflow-hidden rounded-md">
        <div className="bg-white dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-100 p-4 dark:border-zinc-800/60">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">Bagikan File</h3>
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

export default DownloadPage;