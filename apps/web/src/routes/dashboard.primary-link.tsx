import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import {
  Download, Check, ChevronDown, CheckCircle2, AlertCircle,
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

// ─── Download endpoint options ─────────────────────────────────────────────
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

  // Endpoint state
  const [selectedEndpoint, setSelectedEndpoint] = useState("default");
  const [customPrefix, setCustomPrefix] = useState("");
  const [isEndpointDirty, setIsEndpointDirty] = useState(false);

  useEffect(() => {
    if (settings) {
      const ep = settings.download_endpoint ?? "default";
      if (ep.startsWith("custom:")) {
        setSelectedEndpoint("custom");
        setCustomPrefix(ep.slice(7));
      } else {
        setSelectedEndpoint(ep);
        setCustomPrefix("");
      }
      setIsEndpointDirty(false);
    }
  }, [settings]);

  const resolvedEndpoint = (): string => {
    if (selectedEndpoint === "custom") {
      const prefix = customPrefix.trim();
      return prefix ? `custom:${prefix}` : "default";
    }
    return selectedEndpoint;
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
      showNotification("Save done link download");
      toast({ title: "Save done link download", variant: "success" });
      setIsEndpointDirty(false);
    } catch {
      showNotification("Gagal menyimpan endpoint download.", "error");
      toast({ title: "Gagal menyimpan endpoint download.", variant: "error" });
    }
  };

  const previewUrl = () => {
    const ep = resolvedEndpoint();
    const prefix = selectedEndpoint === "custom" ? (customPrefix || "files") : "";
    const epForPreview = selectedEndpoint === "custom" ? `custom:${prefix}` : ep;
    return buildDownloadPath("contoh-file.pdf", "AbCdEfGhIjKlMnOpQrStUvW", epForPreview);
  };

  if (isFetchingData) {
    return <PageTransition><SettingsSkeleton /></PageTransition>;
  }

  return (
    <PageTransition>
      <div className="flex flex-col gap-6 w-full">
        {/* Header */}
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-4 flex-wrap">
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Primary Link</h1>
              {notification && (
                <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold shadow-sm transition-all duration-300 animate-in fade-in slide-in-from-left-3 ${
                  notification.type === "success"
                    ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200/80 dark:border-emerald-900/80 text-emerald-700 dark:text-emerald-400"
                    : "bg-red-50 dark:bg-red-950/30 border-red-200/80 dark:border-red-900/80 text-red-700 dark:text-red-400"
                }`}>
                  {notification.type === "success"
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    : <AlertCircle className="h-4 w-4 text-red-500" />}
                  {notification.message}
                </div>
              )}
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Atur format URL link direct download file.
            </p>
          </div>

          {/* Mobile notification */}
          {notification && (
            <div className="sm:hidden fixed top-4 left-4 right-4 z-[999] flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 shadow-xl animate-in fade-in slide-in-from-top-4 duration-300 border border-zinc-800 dark:border-zinc-200">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-white shrink-0 ${notification.type === "success" ? "bg-emerald-500" : "bg-red-500"}`}>
                {notification.type === "success" ? <Check className="h-3.5 w-3.5 text-white" /> : <AlertCircle className="h-3.5 w-3.5 text-white" />}
              </span>
              <span className="flex-1 text-sm font-semibold">{notification.message}</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-sm overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6 px-5 sm:px-6 py-5 sm:py-6">
            {/* Left: Info */}
            <div className="flex flex-1 items-start gap-3.5 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/20 ring-1 ring-emerald-100 dark:ring-emerald-800">
                <Download className="h-4.5 w-4.5 text-emerald-500 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Permalink Download</h3>
                <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                  Atur format URL link direct download. Setiap file dilindungi dengan kode unik 23 karakter yang otomatis disertakan. Tombol "Salin Link" di halaman Files akan menyalin link direct download.
                </p>
                {/* URL Preview */}
                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">Direct link:</span>
                    <code className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded border border-emerald-100 dark:border-emerald-800/50 break-all">
                      {previewUrl()}
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
                  Simpan Permalink
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
