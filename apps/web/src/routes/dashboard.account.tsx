import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Lock, Eye, EyeOff, ShieldCheck,
  Check, Pencil, RefreshCw,
  CheckCircle2, AlertCircle, User, ChevronDown,
} from "lucide-react";
import { useToast, Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@nqdrive/ui";
import { getAvatarSvg, generateAvatar, setCachedAvatarConfig, getCachedAvatarConfig, generateSeeds, AVATAR_STYLES, type AvatarStyle } from "../lib/avatar";
import { useChangePassword } from "../hooks/auth";
import { useAuthContext } from "../stores/auth-provider";
import { useUpdateSettings } from "../hooks/use-settings";
import { PageTransition } from "../components/page-transition";

export const Route = createFileRoute("/dashboard/account")({
  component: AccountPage,
});

// ─── Avatar Picker Dialog ─────────────────────────────────────────────────────
function AvatarPickerDialog({ open, onOpenChange, currentSeed }: { open: boolean; onOpenChange: (v: boolean) => void; currentSeed: string }) {
  const { toast } = useToast();
  const savedConfig = getCachedAvatarConfig();
  const [style, setStyle] = useState<AvatarStyle>(savedConfig?.style || "pixelArt");
  const [selectedSeed, setSelectedSeed] = useState(savedConfig?.seed || currentSeed);
  const [seeds, setSeeds] = useState<string[]>(() => {
    const base = [currentSeed, ...generateSeeds(11)];
    if (savedConfig?.seed && !base.includes(savedConfig.seed)) {
      base[1] = savedConfig.seed;
    }
    return base;
  });

  const refreshSeeds = useCallback(() => {
    setSeeds([currentSeed, ...generateSeeds(11)]);
  }, [currentSeed]);

  const updateSettings = useUpdateSettings();

  const handleSave = () => {
    updateSettings.mutate(
      { avatar_style: style, avatar_seed: selectedSeed },
      {
        onSuccess: () => {
          setCachedAvatarConfig({ style, seed: selectedSeed });
          toast({ title: "Profile updated", description: "Avatar berhasil diperbarui." });
          onOpenChange(false);
          window.dispatchEvent(new Event("avatar-changed"));
        },
        onError: () => {
          toast({ title: "Gagal", description: "Gagal menyimpan avatar." });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Ganti Avatar</DialogTitle>
      </DialogHeader>
      <DialogContent>
        <div className="flex flex-col gap-4">
          {/* Style selector */}
          <div>
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">Style</p>
            <div className="flex gap-2 flex-wrap">
              {AVATAR_STYLES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStyle(s.value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all border ${
                    style === s.value
                      ? "bg-brand-500 text-white border-brand-500"
                      : "bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Avatar grid */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Pilih Avatar</p>
              <button
                type="button"
                onClick={refreshSeeds}
                className="flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300"
              >
                <RefreshCw className="h-3 w-3" />
                Generate
              </button>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {seeds.map((seed) => (
                <button
                  key={seed}
                  type="button"
                  onClick={() => setSelectedSeed(seed)}
                  className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                    selectedSeed === seed
                      ? "border-brand-500 ring-2 ring-brand-500/30 scale-105"
                      : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500"
                  }`}
                >
                  <img
                    src={generateAvatar(style, seed)}
                    alt="Avatar option"
                    className="h-full w-full object-cover bg-white dark:bg-zinc-800"
                  />
                  {selectedSeed === seed && (
                    <div className="absolute bottom-0.5 right-0.5 bg-brand-500 rounded-full p-0.5">
                      <Check className="h-2.5 w-2.5 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="flex items-center gap-3 rounded-lg border border-zinc-200 dark:border-zinc-700 p-3 bg-zinc-50 dark:bg-zinc-800/50">
            <div className="h-10 w-10 shrink-0 rounded-xl overflow-hidden bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
              <img src={generateAvatar(style, selectedSeed)} alt="Preview" className="h-full w-full object-cover" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Preview</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{AVATAR_STYLES.find(s => s.value === style)?.label}</p>
            </div>
          </div>
        </div>
      </DialogContent>
      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          className="border-zinc-300 dark:border-zinc-600 dark:text-zinc-100 dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700"
        >
          Batal
        </Button>
        <Button onClick={handleSave}>
          <Check className="h-4 w-4" />
          Simpan Avatar
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function AccountPage() {
  const { toast } = useToast();
  const { user } = useAuthContext();
  const changePassword = useChangePassword();

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

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Avatar
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [avatarKey, setAvatarKey] = useState(0);
  useEffect(() => {
    const handler = () => setAvatarKey(k => k + 1);
    window.addEventListener("avatar-changed", handler);
    return () => window.removeEventListener("avatar-changed", handler);
  }, []);

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
      showNotification("Password berhasil diubah");
      toast({ title: "Password berhasil diubah", variant: "success" });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Gagal mengubah password.";
      setFormError(errMsg);
      showNotification(errMsg, "error");
    }
  };

  const pwInputCls = `h-10 w-full rounded-lg border border-zinc-300 bg-zinc-50 pl-10 pr-11 text-sm
    text-zinc-900 placeholder-zinc-400 outline-none transition-all
    focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20
    dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500`;

  return (
    <PageTransition>
      <div className="flex flex-col gap-6 w-full">
        {/* Header */}
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-4 flex-wrap">
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Account</h1>
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
              Kelola profil dan keamanan akun.
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

        {/* ── Profile Card ── */}
        <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-sm overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 px-5 sm:px-6 py-5 sm:py-6">
            <button
              type="button"
              onClick={() => setAvatarPickerOpen(true)}
              className="relative group h-16 w-16 sm:h-20 sm:w-20 shrink-0 rounded-lg bg-brand-50 border border-brand-200 dark:border-brand-800 dark:bg-brand-900/30 flex items-center justify-center shadow-sm overflow-hidden"
            >
              <img
                src={getAvatarSvg(user?.username || user?.email || "User")}
                key={avatarKey}
                alt={user?.username || "Avatar"}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                <Pencil className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{user?.username ?? "Admin"}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                  <User className="h-3.5 w-3.5" />
                  {user?.email || <span className="italic text-zinc-400">Email belum diisi</span>}
                </span>
                <span className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800 px-3 py-0.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                  Administrator
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAvatarPickerOpen(true)}
              className="shrink-0 inline-flex items-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 px-3 h-9 text-sm font-medium text-zinc-700 dark:text-zinc-300 shadow-sm transition-all"
            >
              <Pencil className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Ganti Avatar</span>
            </button>
          </div>
        </div>

        <AvatarPickerDialog
          open={avatarPickerOpen}
          onOpenChange={setAvatarPickerOpen}
          currentSeed={user?.username || user?.email || "User"}
        />

        {/* ── Change Password Card ── */}
        <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-sm overflow-hidden">
          <div className="px-5 sm:px-6 py-5 sm:py-6">
            <div className="flex items-start gap-3.5 mb-5">
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

            <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4 max-w-md">
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
        </div>
      </div>
    </PageTransition>
  );
}
