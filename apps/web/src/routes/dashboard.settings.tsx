import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Lock, User, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useToast } from "@nqdrive/ui";
import { useChangePassword } from "../hooks/use-auth";
import { useAuthContext } from "../stores/auth-provider";
import { PageTransition } from "../components/page-transition";

export const Route = createFileRoute("/dashboard/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { toast } = useToast();
  const { user } = useAuthContext();
  const changePassword = useChangePassword();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (newPassword !== confirmPassword) {
      setFormError("Konfirmasi password baru tidak cocok.");
      return;
    }
    if (newPassword.length < 8) {
      setFormError("Password baru minimal 8 karakter.");
      return;
    }
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      toast({ title: "Password berhasil diubah", variant: "success" });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Gagal mengubah password.");
    }
  };

  return (
    <PageTransition>
      <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Settings</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Kelola pengaturan akun admin Anda.</p>
      </div>

      {/* Card info akun */}
      <div className="max-w-lg rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900/30">
            <User className="h-6 w-6 text-brand-600 dark:text-brand-400" />
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-0.5">Username</p>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{user?.username ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-0.5">Email</p>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                {user?.email ? (
                  user.email
                ) : (
                  <span className="italic text-zinc-400 dark:text-zinc-500">Belum diisi — update via database</span>
                )}
              </p>
            </div>
            <p className="text-xs text-zinc-400 dark:text-zinc-600">Username dan email tidak dapat diubah dari sini.</p>
          </div>
        </div>
      </div>

      {/* Card ubah password */}
      <div className="max-w-lg rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {/* Header card */}
        <div className="flex items-center gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-900/20">
            <ShieldCheck className="h-5 w-5 text-brand-600 dark:text-brand-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Ubah Password</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Username tidak dapat diubah, hanya password.</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
          {/* Password saat ini */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Password Saat Ini
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="h-10 w-full rounded-lg border border-zinc-300 bg-zinc-50 pl-10 pr-11 text-sm
                  text-zinc-900 placeholder-zinc-400 outline-none transition-all
                  focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20
                  dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500
                  dark:focus:border-brand-500 dark:focus:bg-zinc-800"
              />
              <button type="button" onClick={() => setShowCurrent((v) => !v)} tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition-colors">
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Password baru */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Password Baru
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Minimal 8 karakter"
                className="h-10 w-full rounded-lg border border-zinc-300 bg-zinc-50 pl-10 pr-11 text-sm
                  text-zinc-900 placeholder-zinc-400 outline-none transition-all
                  focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20
                  dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500
                  dark:focus:border-brand-500 dark:focus:bg-zinc-800"
              />
              <button type="button" onClick={() => setShowNew((v) => !v)} tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition-colors">
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Konfirmasi */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Konfirmasi Password Baru
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="Ulangi password baru"
                className="h-10 w-full rounded-lg border border-zinc-300 bg-zinc-50 pl-10 pr-11 text-sm
                  text-zinc-900 placeholder-zinc-400 outline-none transition-all
                  focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20
                  dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500
                  dark:focus:border-brand-500 dark:focus:bg-zinc-800"
              />
              <button type="button" onClick={() => setShowConfirm((v) => !v)} tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition-colors">
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Error */}
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 dark:border-red-800 dark:bg-red-950">
              <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
            </div>
          )}

          {/* FIX: Tombol brand-500 dengan warna explicit agar kelihatan di light mode */}
          <button
            type="submit"
            disabled={changePassword.isPending}
            className="mt-1 inline-flex h-10 items-center justify-center gap-2 rounded-lg
              bg-brand-500 px-5 text-sm font-semibold text-white shadow-sm shadow-brand-500/25
              transition-all hover:bg-brand-600 active:scale-[0.98]
              disabled:cursor-not-allowed disabled:opacity-60 w-full sm:w-auto"
          >
            <ShieldCheck className="h-4 w-4" />
            {changePassword.isPending ? "Menyimpan..." : "Ubah Password"}
          </button>
        </form>
      </div>
      </div>
    </PageTransition>
  );
}
