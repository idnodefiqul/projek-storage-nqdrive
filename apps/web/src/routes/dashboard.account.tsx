import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import {
  Lock, Eye, EyeOff, ShieldCheck,
  Check, Pencil, RefreshCw,
  User,
} from "lucide-react";
import { useToast, Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@nqdrive/ui";
import { getAvatarSvg, generateAvatar, setCachedAvatarConfig, getCachedAvatarConfig, generateSeeds, AVATAR_STYLES, type AvatarStyle } from "../lib/avatar";
import { useChangePassword } from "../hooks/auth";
import { useAuthContext } from "../stores/auth-provider";
import { useUpdateSettings } from "../hooks/use-settings";
import { PageTransition } from "../components/page-transition";
import { PageHeader } from "../components/ui-kit";

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
            <p className="text-xs font-medium text-[rgb(var(--ink-500))] mb-2">Style</p>
            <div className="flex gap-2 flex-wrap">
              {AVATAR_STYLES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStyle(s.value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all border ${
                    style === s.value
                      ? "bg-brand-500 text-white border-brand-500"
                      : "bg-[rgb(var(--surface-muted))] text-[rgb(var(--ink-500))] border-[rgb(var(--border-subtle))] hover:bg-[rgb(var(--surface-muted))]"
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
              <p className="text-xs font-medium text-[rgb(var(--ink-500))]">Pilih Avatar</p>
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
                      : "border-[rgb(var(--border-subtle))] dark:border-[rgb(var(--border-subtle))] hover:border-[rgb(var(--border-subtle))] dark:hover:border-[rgb(var(--border-subtle))]"
                  }`}
                >
                  <img
                    src={generateAvatar(style, seed)}
                    alt="Avatar option"
                    className="h-full w-full object-cover bg-[rgb(var(--surface))] dark:bg-[rgb(var(--surface-muted))]"
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
          <div className="flex items-center gap-3 rounded-lg border border-[rgb(var(--border-subtle))] dark:border-[rgb(var(--border-subtle))] p-3 bg-[rgb(var(--surface-muted))] dark:bg-[rgb(var(--surface-muted))]/50">
            <div className="h-10 w-10 shrink-0 rounded-xl overflow-hidden bg-[rgb(var(--surface))] dark:bg-[rgb(var(--surface-muted))] border border-[rgb(var(--border-subtle))] dark:border-[rgb(var(--border-subtle))]">
              <img src={generateAvatar(style, selectedSeed)} alt="Preview" className="h-full w-full object-cover" />
            </div>
            <div>
              <p className="text-sm font-medium text-[rgb(var(--foreground))]">Preview</p>
              <p className="text-xs text-[rgb(var(--ink-500))]">{AVATAR_STYLES.find(s => s.value === style)?.label}</p>
            </div>
          </div>
        </div>
      </DialogContent>
      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          className="border-[rgb(var(--border-subtle))] dark:border-[rgb(var(--border-subtle))] dark:text-[rgb(var(--foreground))] dark:bg-[rgb(var(--surface-muted))] hover:bg-[rgb(var(--surface-muted))] dark:hover:bg-[rgb(var(--surface-muted))]"
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
      toast({ title: "Konfirmasi password baru tidak cocok.", variant: "error" });
      return;
    }
    if (newPassword.length < 8) {
      setFormError("Password baru minimal 8 karakter.");
      toast({ title: "Password baru minimal 8 karakter.", variant: "error" });
      return;
    }
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      toast({ title: "Password berhasil diubah", variant: "success" });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Gagal mengubah password.";
      setFormError(errMsg);
      toast({ title: errMsg, variant: "error" });
    }
  };

  const pwInputCls = `h-10 w-full rounded-lg border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface-muted))] pl-10 pr-11 text-sm
    text-[rgb(var(--foreground))] placeholder-[rgb(var(--ink-500))] outline-none transition-all
    focus:border-brand-500 focus:bg-[rgb(var(--surface))] focus:ring-2 focus:ring-brand-500/20
    dark:border-[rgb(var(--border-subtle))] dark:bg-[rgb(var(--surface-muted))] dark:text-[rgb(var(--foreground))] dark:placeholder-[rgb(var(--ink-500))]`;

  return (
    <PageTransition>
      <div className="flex flex-col gap-6 w-full">
        <PageHeader
          eyebrow="Settings"
          icon={User}
          title="Account"
          description="Kelola profil dan keamanan akun."
        />

        {/* ── Profile Card ── */}
        <div className="app-card overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 px-5 sm:px-6 py-5 sm:py-6">
            <button
              type="button"
              aria-label="Ganti avatar"
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
              <h3 className="text-lg font-semibold text-[rgb(var(--foreground))]">{user?.username ?? "Admin"}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="flex items-center gap-1.5 text-sm text-[rgb(var(--ink-500))]">
                  <User className="h-3.5 w-3.5" />
                  {user?.email || <span className="italic text-[rgb(var(--ink-500))]">Email belum diisi</span>}
                </span>
                <span className="inline-flex items-center rounded-full bg-[rgb(var(--surface-muted))] dark:bg-[rgb(var(--surface-muted))] px-3 py-0.5 text-xs font-semibold text-[rgb(var(--ink-500))] dark:text-[rgb(var(--foreground))] border border-[rgb(var(--border-subtle))] dark:border-[rgb(var(--border-subtle))]">
                  Administrator
                </span>
              </div>
            </div>
            <button
              type="button"
              aria-label="Ganti avatar"
              onClick={() => setAvatarPickerOpen(true)}
              className="shrink-0 inline-flex items-center gap-2 rounded-lg border border-[rgb(var(--border-subtle))] dark:border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] hover:bg-[rgb(var(--surface-muted))] dark:hover:bg-[rgb(var(--surface-muted))] px-3 h-9 text-sm font-medium text-[rgb(var(--ink-500))] dark:text-[rgb(var(--foreground))] shadow-sm transition-all"
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
        <div className="app-card overflow-hidden">
          <div className="px-5 sm:px-6 py-5 sm:py-6">
            <div className="flex items-start gap-3.5 mb-5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50 dark:bg-red-900/20 ring-1 ring-red-100 dark:ring-red-800">
                <ShieldCheck className="h-4.5 w-4.5 text-red-500 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[rgb(var(--foreground))]">Keamanan Sandi</h3>
                <p className="text-[13px] text-[rgb(var(--ink-500))] mt-0.5">
                  Ubah kata sandi admin secara berkala untuk menjaga keamanan.
                </p>
              </div>
            </div>

            <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4 max-w-md">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--ink-500))]">Password Saat Ini</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--ink-500))]" />
                  <input
                    type={showCurrent ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className={pwInputCls}
                  />
                  <button type="button" onClick={() => setShowCurrent((v) => !v)} tabIndex={-1}
                    aria-label={showCurrent ? "Sembunyikan password saat ini" : "Tampilkan password saat ini"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgb(var(--ink-500))] hover:text-[rgb(var(--ink-500))] transition-colors">
                    {showCurrent ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--ink-500))]">Password Baru</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--ink-500))]" />
                  <input
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required minLength={8}
                    placeholder="Minimal 8 karakter"
                    className={pwInputCls}
                  />
                  <button type="button" onClick={() => setShowNew((v) => !v)} tabIndex={-1}
                    aria-label={showNew ? "Sembunyikan password baru" : "Tampilkan password baru"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgb(var(--ink-500))] hover:text-[rgb(var(--ink-500))] transition-colors">
                    {showNew ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--ink-500))]">Konfirmasi Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--ink-500))]" />
                  <input
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="Ulangi password baru"
                    className={pwInputCls}
                  />
                  <button type="button" onClick={() => setShowConfirm((v) => !v)} tabIndex={-1}
                    aria-label={showConfirm ? "Sembunyikan konfirmasi password" : "Tampilkan konfirmasi password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgb(var(--ink-500))] hover:text-[rgb(var(--ink-500))] transition-colors">
                    {showConfirm ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
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
