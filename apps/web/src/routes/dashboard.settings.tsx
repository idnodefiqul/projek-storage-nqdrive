import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import {
  Lock, Eye, EyeOff, ShieldCheck,
  Check, Download,
  CheckCircle2, AlertCircle, User, ChevronDown
} from "lucide-react";
import { useToast, Badge } from "@nqdrive/ui";
import { getAvatarSvg } from "../lib/avatar";
import { useChangePassword } from "../hooks/auth";
import { useAuthContext } from "../stores/auth-provider";
import { useSettings, useUpdateSettings } from "../hooks/use-settings";
import { useMinLoading } from "../hooks/use-min-loading";
import { SettingsSkeleton } from "../components/skeletons";
import { PageTransition } from "../components/page-transition";
import { buildDownloadPath } from "../services/settings.service";

export const Route = createFileRoute("/dashboard/settings")({
  component: SettingsPage,
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

// ─── Main Page ─────────────────────────────────────────────────────────────
function SettingsPage() {
  const { toast } = useToast();
  const { user } = useAuthContext();
  const changePassword = useChangePassword();
  const { data: settings, isLoading: isLoadingSettings } = useSettings();
  const updateSettings = useUpdateSettings();

  // Skeleton loading buffer (min 600ms)
  const isFetchingData = useMinLoading(isLoadingSettings, 600);

  // Custom notification state
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const notificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotification = (message: string, type: "success" | "error" = "success") => {
    if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
    setNotification({ message, type });
    notificationTimeoutRef.current = setTimeout(() => setNotification(null), 4000);
  };

  // Password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword]         = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError]             = useState<string | null>(null);
  const [showCurrent, setShowCurrent]         = useState(false);
  const [showNew, setShowNew]                 = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [passwordOpen, setPasswordOpen]       = useState(false);

  // Download endpoint state
  const [selectedEndpoint, setSelectedEndpoint] = useState("default");
  const [customPrefix, setCustomPrefix]         = useState("");
  const [isEndpointDirty, setIsEndpointDirty]   = useState(false);

  // Sync state from server
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

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => { if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current); };
  }, []);

  // ── Download endpoint handlers ──────────────────────────────────────────
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

  // ── Password handler ────────────────────────────────────────────────────
  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (newPassword !== confirmPassword) {
      setFormError("Konfirmasi password baru tidak cocok.");
      showNotification("Konfirmasi password baru tidak cocok.", "error");
      return;
    }
    if (newPassword.length < 8) {
      setFormError("Password baru minimal 8 karakter.");
      showNotification("Password baru minimal 8 karakter.", "error");
      return;
    }
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      showNotification("Save done change password");
      toast({ title: "Save done change password", variant: "success" });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setPasswordOpen(false);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Gagal mengubah password.";
      setFormError(errMsg);
      showNotification(errMsg, "error");
    }
  };

  // ── Preview download URL ────────────────────────────────────────────────
  const previewUrl = () => {
    const ep = resolvedEndpoint();
    const prefix = selectedEndpoint === "custom" ? (customPrefix || "files") : "";
    const epForPreview = selectedEndpoint === "custom" ? `custom:${prefix}` : ep;
    return buildDownloadPath("contoh-file.pdf", "AbCdEfGhIjKlMnOpQrStUvW", epForPreview);
  };

  const isUpdatingSettings = updateSettings.isPending;

  if (isFetchingData) {
    return (
      <PageTransition>
        <SettingsSkeleton />
      </PageTransition>
    );
  }

  // ── Shared input class ──────────────────────────────────────────────────
  const inputCls = `h-10 w-full rounded-lg border border-zinc-300 bg-zinc-50 pl-10 pr-4 text-sm
    text-zinc-900 placeholder-zinc-400 outline-none transition-all
    focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20
    dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500
    dark:focus:border-brand-500 dark:focus:bg-zinc-800
    disabled:opacity-50 disabled:cursor-not-allowed`;

  const pwInputCls = `h-10 w-full rounded-lg border border-zinc-300 bg-zinc-50 pl-10 pr-11 text-sm
    text-zinc-900 placeholder-zinc-400 outline-none transition-all
    focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20
    dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500`;

  return (
    <PageTransition>
      <div className="flex flex-col gap-6 w-full">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-4 flex-wrap">
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 font-sans">Settings</h1>

              {/* DESKTOP NOTIFICATION */}
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
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 font-sans">
              Kelola pengaturan akun dan konfigurasi sistem {import.meta.env.VITE_SITE_NAME || "NQDRIVE"}.
            </p>
          </div>

          {/* MOBILE NOTIFICATION */}
          {notification && (
            <div className="sm:hidden fixed top-4 left-4 right-4 z-[999] flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 shadow-xl dark:shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300 border border-zinc-800 dark:border-zinc-200">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-white shrink-0 ${
                notification.type === "success" ? "bg-emerald-500" : "bg-red-500"
              }`}>
                {notification.type === "success"
                  ? <Check className="h-3.5 w-3.5 text-white" />
                  : <AlertCircle className="h-3.5 w-3.5 text-white" />}
              </span>
              <span className="flex-1 text-sm font-semibold">{notification.message}</span>
            </div>
          )}
        </div>

        {/* ── BIG SINGLE CONTAINER (All Settings) ──────────────────────── */}
        <section className="flex flex-col gap-4">
          
          <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-sm overflow-hidden">
            
            {/* Table header */}
            <div className="hidden sm:grid grid-cols-[1fr_auto] border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/60 px-6 py-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Pengaturan</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Konfigurasi</span>
            </div>

            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">

              {/* ── Row 2: Permalink Download ────────────────────────── */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-4 px-5 sm:px-6 py-5 bg-zinc-50/30 dark:bg-zinc-900/10">
                {/* Left Side: Info */}
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

                {/* Right Side: Select Dropdown & Action */}
                <div className="sm:w-[320px] shrink-0 flex flex-col gap-2">
                  <div className="relative">
                    <select
                      value={selectedEndpoint}
                      onChange={(e) => {
                        setSelectedEndpoint(e.target.value);
                        setIsEndpointDirty(true);
                      }}
                      className="h-10 w-full appearance-none rounded-lg border border-zinc-300 bg-white pl-4 pr-10 text-sm font-medium
                        text-zinc-900 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20
                        dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    >
                      {ENDPOINT_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                  </div>

                  {/* Custom prefix input if selected */}
                  {selectedEndpoint === "custom" && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-mono">/</span>
                          <input
                            type="text"
                            value={customPrefix}
                            onChange={(e) => {
                              setCustomPrefix(e.target.value.replace(/[^a-z0-9_-]/gi, ""));
                              setIsEndpointDirty(true);
                            }}
                            placeholder="custom_prefix"
                            maxLength={32}
                            className="h-9 w-full rounded-md border border-zinc-300 bg-white pl-7 pr-3 text-[13px] font-mono
                              text-zinc-900 placeholder-zinc-400 outline-none transition-all
                              focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20
                              dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                          />
                        </div>
                        <span className="text-xs text-zinc-400 font-mono">/:file</span>
                      </div>
                    </div>
                  )}

                  {/* Save Button for Permalink */}
                  <div className="mt-1 flex justify-end">
                    <button
                      onClick={handleEndpointSave}
                      disabled={!isEndpointDirty || isUpdatingSettings}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 text-xs font-semibold text-white
                        shadow-sm shadow-emerald-500/20 transition-all hover:bg-emerald-600 active:scale-[0.98]
                        disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Simpan Permalink
                    </button>
                  </div>
                </div>
              </div>


              {/* ── Row 3: Info Akun (Read-only) ─────────────────────── */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 px-5 sm:px-6 py-5">
                <div className="flex flex-1 items-center gap-3.5 min-w-0">
                  <div className="h-9 w-9 shrink-0 rounded-xl bg-brand-50 border border-brand-200 dark:border-brand-800 dark:bg-brand-900/30 flex items-center justify-center shadow-sm overflow-hidden">
                    <img 
                      src={getAvatarSvg(user?.username || user?.email || "User")} 
                      alt={user?.username || "Avatar"} 
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Info Akun</h3>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5">
                      <span className="flex items-center gap-1.5 text-[13px] text-zinc-500 dark:text-zinc-400">
                        <User className="h-3.5 w-3.5" />
                        {user?.username ?? "—"}
                      </span>
                      <span className="text-[13px] text-zinc-500 dark:text-zinc-400">
                        {user?.email || <span className="italic text-zinc-400">Email belum diisi</span>}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="sm:w-[320px] shrink-0 flex justify-end sm:justify-start">
                  <span className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                    Administrator
                  </span>
                </div>
              </div>


              {/* ── Row 4: Ubah Password ──────────────────────────────── */}
              <div>
                <button
                  type="button"
                  onClick={() => { setPasswordOpen((v) => !v); setFormError(null); }}
                  className="w-full flex flex-col sm:flex-row sm:items-center gap-4 px-5 sm:px-6 py-5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
                >
                  <div className="flex flex-1 items-center gap-3.5 min-w-0 w-full">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50 dark:bg-red-900/20 ring-1 ring-red-100 dark:ring-red-800">
                      <ShieldCheck className="h-4.5 w-4.5 text-red-500 dark:text-red-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Keamanan Sandi</h3>
                      <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Ubah kata sandi admin secara berkala untuk menjaga keamanan.
                      </p>
                    </div>
                  </div>
                  <div className="sm:w-[320px] shrink-0 flex justify-end sm:justify-start w-full">
                    <span className="inline-flex items-center gap-2 text-xs font-medium text-brand-600 dark:text-brand-400">
                      {passwordOpen ? "Tutup Form" : "Ubah Password"}
                      <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${passwordOpen ? "rotate-180" : ""}`} />
                    </span>
                  </div>
                </button>

                {/* Password Form Expansion */}
                {passwordOpen && (
                  <div className="border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/20 px-5 sm:px-6 pb-6 pt-5 animate-in fade-in slide-in-from-top-2">
                    <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4 max-w-sm ml-0 sm:ml-[50px]">
                      
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Password Saat Ini</label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                          <input
                            type={showCurrent ? "text" : "password"}
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            required
                            placeholder="••••••••"
                            className={pwInputCls}
                          />
                          <button type="button" onClick={() => setShowCurrent((v) => !v)} tabIndex={-1}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition-colors">
                            {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Password Baru</label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                          <input
                            type={showNew ? "text" : "password"}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required minLength={8}
                            placeholder="Minimal 8 karakter"
                            className={pwInputCls}
                          />
                          <button type="button" onClick={() => setShowNew((v) => !v)} tabIndex={-1}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition-colors">
                            {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Konfirmasi Password</label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                          <input
                            type={showConfirm ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            placeholder="Ulangi password baru"
                            className={pwInputCls}
                          />
                          <button type="button" onClick={() => setShowConfirm((v) => !v)} tabIndex={-1}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition-colors">
                            {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      {formError && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 dark:border-red-800/60 dark:bg-red-950/40">
                          <p className="text-[13px] text-red-600 dark:text-red-400 font-medium">{formError}</p>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={changePassword.isPending}
                        className="mt-2 inline-flex w-full h-10 items-center justify-center gap-2 rounded-lg
                          bg-red-500 hover:bg-red-600 px-5 text-sm font-semibold text-white shadow-sm shadow-red-500/25
                          transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <ShieldCheck className="h-4 w-4" />
                        {changePassword.isPending ? "Menyimpan..." : "Update Password"}
                      </button>
                    </form>
                  </div>
                )}
              </div>

            </div>
          </div>
        </section>

      </div>
    </PageTransition>
  );
}
