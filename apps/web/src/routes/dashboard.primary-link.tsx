import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import {
  Download, Check, ChevronDown, CheckCircle2, AlertCircle, Share2
} from "lucide-react";
import { useToast } from "@nqdrive/ui";
import { useSettings, useUpdateSettings } from "../hooks/use-settings";
import { useMinLoading } from "../hooks/use-min-loading";
import { SettingsSkeleton } from "../components/skeletons";
import { PageTransition } from "../components/page-transition";
import { buildDownloadPath } from "../services/settings.service";

export const Route = createFileRoute("/dashboard/primary-link")({
  component: PrimaryLinkPage,
});

// Download endpoint options
interface EndpointOption {
  id: string;
  label: string;
  description: string;
  example: string;
  isCustom?: boolean;
}

const ENDPOINT_OPTIONS: EndpointOption[] = [
  {
    id: "default",
    label: "Default (/:filename)",
    description: "Direct link — paling pendek, tidak ada prefix.",
    example: "/laporan-q1.pdf",
  },
  {
    id: "download",
    label: "Download (/download/:filename)",
    description: "Prefix /download/ — paling umum, familiar untuk pengguna.",
    example: "/download/laporan-q1.pdf",
  },
  {
    id: "dl",
    label: "Short (/dl/:filename)",
    description: "Prefix /dl/ — singkat namun tetap jelas.",
    example: "/dl/laporan-q1.pdf",
  },
  {
    id: "get",
    label: "API Style (/get/:filename)",
    description: "Prefix /get/ — alternatif populer di API-style URL.",
    example: "/get/laporan-q1.pdf",
  },
  {
    id: "query",
    label: "Query (/:filename?download)",
    description: "Query param — URL sama seperti default tapi dengan ?download.",
    example: "/laporan-q1.pdf?download",
  },
  {
    id: "custom",
    label: "Custom Prefix",
    description: "Buat prefix sendiri, contoh: /files/, /media/, dst.",
    example: "/files/laporan-q1.pdf",
    isCustom: true,
  },
];

const SHARE_PREFIX_OPTIONS = [
  { id: "p", label: "Default (/p/:shareCode)", example: "/p/AbCdEfGhIjKlMnOpQrStUvW" },
  { id: "s", label: "Short (/s/:shareCode)", example: "/s/AbCdEfGhIjKlMnOpQrStUvW" },
  { id: "f", label: "File (/f/:shareCode)", example: "/f/AbCdEfGhIjKlMnOpQrStUvW" },
  { id: "custom", label: "Custom Prefix", example: "/custom_prefix/AbCdEfGhIjKlMnOpQrStUvW" },
];

function PrimaryLinkPage() {
  const { toast } = useToast();
  const { data: settings, isLoading: isLoadingSettings } = useSettings();
  const updateSettings = useUpdateSettings();
  const isFetchingData = useMinLoading(isLoadingSettings, 600);

  // Notification
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const notificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNotification = (message: string, type: "success" | "error" = "success") => {
    if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
    setNotification({ message, type });
    notificationTimeoutRef.current = setTimeout(() => setNotification(null), 4000);
  };
  useEffect(() => {
    return () => { if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current); };
  }, []);

  // Direct download link state
  const [selectedEndpoint, setSelectedEndpoint] = useState("default");
  const [customPrefix, setCustomPrefix] = useState("");
  const [isEndpointDirty, setIsEndpointDirty] = useState(false);

  // Share page link state
  const [selectedSharePrefix, setSelectedSharePrefix] = useState("p");
  const [customSharePrefix, setCustomSharePrefix] = useState("");
  const [isSharePrefixDirty, setIsSharePrefixDirty] = useState(false);


  useEffect(() => {
    if (settings) {
      // Direct Download
      const ep = settings.download_endpoint ?? "default";
      if (ep.startsWith("custom:")) {
        setSelectedEndpoint("custom");
        setCustomPrefix(ep.slice(7));
      } else {
        setSelectedEndpoint(ep);
        setCustomPrefix("");
      }
      setIsEndpointDirty(false);

      // Share Page
      const sp = (settings as any).share_page_prefix ?? "p";
      if (sp.startsWith("custom:")) {
        setSelectedSharePrefix("custom");
        setCustomSharePrefix(sp.slice(7));
      } else {
        setSelectedSharePrefix(sp);
        setCustomSharePrefix("");
      }
      setIsSharePrefixDirty(false);
    }
  }, [settings]);

  const resolvedEndpoint = (): string => {
    if (selectedEndpoint === "custom") {
      const prefix = customPrefix.trim();
      return prefix ? `custom:${prefix}` : "default";
    }
    return selectedEndpoint;
  };

  const resolvedSharePrefix = (): string => {
    if (selectedSharePrefix === "custom") {
      const prefix = customSharePrefix.trim();
      return prefix ? `custom:${prefix}` : "p";
    }
    return selectedSharePrefix;
  };

  const handleEndpointSave = async () => {
    const ep = resolvedEndpoint();
    if (selectedEndpoint === "custom" && !customPrefix.trim()) {
      showNotification("Masukkan custom prefix terlebih dahulu.", "error");
      toast({ title: "Masukkan custom prefix terlebih dahulu.", variant: "error" });
      return;
    }
    if (selectedEndpoint === "custom" && !/^[a-z0-9_-]+$/i.test(customPrefix.trim())) {
      showNotification("Custom prefix hanya boleh berisi huruf, angka, - dan _.", "error");
      toast({ title: "Custom prefix hanya boleh berisi huruf, angka, - dan _.", variant: "error" });
      return;
    }
    try {
      await updateSettings.mutateAsync({ download_endpoint: ep });
      showNotification("Format permalink download berhasil disimpan.");
      toast({ title: "Format permalink download berhasil disimpan.", variant: "success" });
      setIsEndpointDirty(false);
    } catch {
      showNotification("Gagal menyimpan endpoint download.", "error");
      toast({ title: "Gagal menyimpan endpoint download.", variant: "error" });
    }
  };

  const handleSharePrefixSave = async () => {
    const sp = resolvedSharePrefix();
    if (selectedSharePrefix === "custom" && !customSharePrefix.trim()) {
      showNotification("Masukkan custom share prefix terlebih dahulu.", "error");
      toast({ title: "Masukkan custom share prefix terlebih dahulu.", variant: "error" });
      return;
    }
    if (selectedSharePrefix === "custom" && !/^[a-z0-9_-]+$/i.test(customSharePrefix.trim())) {
      showNotification("Custom prefix share hanya boleh berisi huruf, angka, - dan _.", "error");
      toast({ title: "Custom prefix share hanya boleh berisi huruf, angka, - dan _.", variant: "error" });
      return;
    }
    try {
      await updateSettings.mutateAsync({ share_page_prefix: sp } as any);
      showNotification("Format link share page berhasil disimpan.");
      toast({ title: "Format link share page berhasil disimpan.", variant: "success" });
      setIsSharePrefixDirty(false);
    } catch {
      showNotification("Gagal menyimpan prefix share page.", "error");
      toast({ title: "Gagal menyimpan prefix share page.", variant: "error" });
    }
  };


  // Preview URLs
  const previewDirectUrl = () => {
    const base = "https://drive.fiqul.id";
    const code = "AbCdEfGhIjKlMnOpQrStUvW";
    const filename = "contoh-file.pdf";
    return `${base}${buildDownloadPath(filename, code, resolvedEndpoint())}`;
  };

  const previewShareUrl = () => {
    const base = "https://drive.fiqul.id";
    const code = "AbCdEfGhIjKlMnOpQrStUvW";
    const sp = resolvedSharePrefix();
    let prefix = "p";
    if (sp === "s") prefix = "s";
    else if (sp === "f") prefix = "f";
    else if (sp.startsWith("custom:")) prefix = sp.slice(7);
    return `${base}/${prefix}/${code}`;
  };

  if (isFetchingData) return <SettingsSkeleton />;

  return (
    <PageTransition>
      <div className="flex flex-col gap-6 max-w-4xl">
        {/* Header */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Link Settings</h1>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Konfigurasi direct download link dan format halaman share file.
          </p>

          {/* Toast Notification */}
          {notification && (
            <div className={`mt-3 flex items-center gap-2.5 rounded-xl border border-zinc-200/80 bg-zinc-50 px-4 py-3 shadow-md dark:border-white/5 dark:bg-zinc-950/40 animate-in fade-in duration-300 text-zinc-900 dark:text-zinc-100`}>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${notification.type === "success" ? "bg-emerald-500" : "bg-red-500"}`}>
                {notification.type === "success" ? <Check className="h-3.5 w-3.5 text-white" /> : <AlertCircle className="h-3.5 w-3.5 text-white" />}
              </span>
              <span className="flex-1 text-sm font-semibold">{notification.message}</span>
            </div>
          )}
        </div>

        {/* 1. DIRECT PERMALINK DOWNLOAD */}
        <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-sm overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6 px-5 sm:px-6 py-5 sm:py-6">
            {/* Left: Info */}
            <div className="flex flex-1 items-start gap-3.5 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/20 ring-1 ring-emerald-100 dark:ring-emerald-800">
                <Download className="h-4.5 w-4.5 text-emerald-500 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Direct Download Link</h3>
                <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                  Atur format link raw direct download. Link ini ditujukan untuk program otomatis (seperti CLI tools, download manager) untuk langsung mengunduh file tanpa melewati browser interface.
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">Contoh URL Direct:</span>
                    <code className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded border border-emerald-100 dark:border-emerald-800/50 break-all font-mono">
                      {previewDirectUrl()}
                    </code>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Select + Action */}
            <div className="sm:w-[320px] shrink-0 flex flex-col gap-2">
              <div className="relative">
                <select
                  value={selectedEndpoint}
                  onChange={(e) => { setSelectedEndpoint(e.target.value); setIsEndpointDirty(true); }}
                  className="h-10 w-full appearance-none rounded-lg border border-zinc-300 bg-white pl-4 pr-10 text-sm font-medium text-zinc-900 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  {ENDPOINT_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              </div>

              {selectedEndpoint === "custom" && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-mono">/</span>
                      <input
                        type="text"
                        value={customPrefix}
                        onChange={(e) => { setCustomPrefix(e.target.value.replace(/[^a-z0-9_-]/gi, "")); setIsEndpointDirty(true); }}
                        placeholder="custom_prefix"
                        maxLength={32}
                        className="h-9 w-full rounded-md border border-zinc-300 bg-white pl-7 pr-3 text-[13px] font-mono text-zinc-900 placeholder-zinc-400 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                      />
                    </div>
                    <span className="text-xs text-zinc-400 font-mono">/:file</span>
                  </div>
                </div>
              )}

              <div className="mt-1 flex justify-end">
                <button
                  onClick={handleEndpointSave}
                  disabled={!isEndpointDirty || updateSettings.isPending}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 text-xs font-semibold text-white shadow-sm shadow-emerald-500/20 transition-all hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Check className="h-3.5 w-3.5" />
                  Simpan Format Direct
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 2. FORMAT LINK SHARE PAGE */}
        <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-sm overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6 px-5 sm:px-6 py-5 sm:py-6">
            {/* Left: Info */}
            <div className="flex flex-1 items-start gap-3.5 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-100 dark:ring-blue-800">
                <Share2 className="h-4.5 w-4.5 text-blue-500 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Format Link Share Page</h3>
                <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                  Tentukan link share page untuk didistribusikan kepada publik. Ketika tombol "Salin Link" di halaman Files ditekan, tautan share page ini yang akan disalin (bukan direct download).
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">Contoh URL Share Page:</span>
                    <code className="text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded border border-blue-100 dark:border-blue-800/50 break-all font-mono">
                      {previewShareUrl()}
                    </code>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Select + Action */}
            <div className="sm:w-[320px] shrink-0 flex flex-col gap-2">
              <div className="relative">
                <select
                  value={selectedSharePrefix}
                  onChange={(e) => { setSelectedSharePrefix(e.target.value); setIsSharePrefixDirty(true); }}
                  className="h-10 w-full appearance-none rounded-lg border border-zinc-300 bg-white pl-4 pr-10 text-sm font-medium text-zinc-900 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  {SHARE_PREFIX_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              </div>

              {selectedSharePrefix === "custom" && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-mono">/</span>
                      <input
                        type="text"
                        value={customSharePrefix}
                        onChange={(e) => { setCustomSharePrefix(e.target.value.replace(/[^a-z0-9_-]/gi, "")); setIsSharePrefixDirty(true); }}
                        placeholder="share_prefix"
                        maxLength={32}
                        className="h-9 w-full rounded-md border border-zinc-300 bg-white pl-7 pr-3 text-[13px] font-mono text-zinc-900 placeholder-zinc-400 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                      />
                    </div>
                    <span className="text-xs text-zinc-400 font-mono">/:shareCode</span>
                  </div>
                </div>
              )}

              <div className="mt-1 flex justify-end">
                <button
                  onClick={handleSharePrefixSave}
                  disabled={!isSharePrefixDirty || updateSettings.isPending}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 text-xs font-semibold text-white shadow-sm shadow-emerald-500/20 transition-all hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Check className="h-3.5 w-3.5" />
                  Simpan Format Share
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </PageTransition>
  );
}