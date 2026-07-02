import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Lock, User, ShieldCheck } from "lucide-react";
import { useSetupAdmin, useSetupStatus } from "../hooks/auth";
import { Particles } from "@nqdrive/ui";
import { motion } from "framer-motion";

export const Route = createFileRoute("/setup")({
  component: SetupPage,
});

function SetupPage() {
  const navigate = useNavigate();
  const { data: setupStatus, isLoading: isCheckingStatus } = useSetupStatus();
  const setupAdmin = useSetupAdmin();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isCheckingStatus && setupStatus?.setupCompleted) {
      navigate({ to: "/login" });
    }
  }, [isCheckingStatus, setupStatus, navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (password !== confirmPassword) {
      setFormError("Konfirmasi password tidak cocok.");
      return;
    }
    if (password.length < 8) {
      setFormError("Password minimal 8 karakter.");
      return;
    }

    try {
      await setupAdmin.mutateAsync({ username, email, password });
      navigate({ to: "/login" });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Setup gagal.");
    }
  };

  if (isCheckingStatus || setupStatus?.setupCompleted) {
    return null;
  }

  const inputClass = `
    h-11 w-full rounded-xl border border-zinc-300 bg-zinc-50
    pl-10 pr-4 text-sm text-zinc-900 placeholder-zinc-400
    outline-none transition-all
    focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20
    dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder-zinc-600
    dark:focus:border-brand-500/60 dark:focus:bg-white/8
  `;

  const inputWithToggleClass = `
    h-11 w-full rounded-xl border border-zinc-300 bg-zinc-50
    pl-10 pr-11 text-sm text-zinc-900 placeholder-zinc-400
    outline-none transition-all
    focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20
    dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder-zinc-600
    dark:focus:border-brand-500/60 dark:focus:bg-white/8
  `;

  const labelClass = "text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
  const iconClass = "absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-100 px-4 dark:bg-zinc-950">

      {/* Particles background */}
      <Particles
        className="absolute inset-0 z-0"
        quantity={300}
        ease={80}
        color="#10b981"
        refresh
      />

      {/* Gradient blobs */}
      <div
        className="pointer-events-none absolute -top-60 -left-60 h-[600px] w-[600px] rounded-full opacity-30 dark:opacity-100"
        style={{ background: "radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 65%)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-40 -right-20 h-[400px] w-[400px] rounded-full opacity-20 dark:opacity-100"
        style={{ background: "radial-gradient(circle, rgba(5,150,105,0.08) 0%, transparent 65%)" }}
      />

      {/* Card */}
      <motion.div 
        className="relative z-10 w-full max-w-sm"
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-xl dark:border-white/10 dark:bg-white/5 dark:shadow-2xl dark:backdrop-blur-xl dark:ring-1 dark:ring-white/5">

          {/* Logo + branding */}
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="mb-6 flex flex-col items-center gap-3"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500 shadow-lg shadow-brand-500/30 dark:shadow-brand-500/40 ring-1 ring-brand-400/30">
              <svg
                viewBox="0 0 40 40"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="h-9 w-9"
              >
                <rect x="2"  y="14" width="16" height="16" rx="5" fill="rgba(255,255,255,0.4)" />
                <rect x="12" y="8"  width="16" height="16" rx="5" fill="rgba(255,255,255,0.7)" />
                <rect x="22" y="14" width="16" height="16" rx="5" fill="rgba(255,255,255,1)"   />
              </svg>
            </div>

            <div className="text-center mt-2">
              <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
                Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-emerald-500 dark:from-brand-400 dark:to-emerald-400">{import.meta.env.VITE_SITE_NAME || "NQDRIVE"} Setup</span>
              </h1>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Let's get your unified storage ready</p>
            </div>
          </motion.div>

          {/* Info banner */}
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 p-3 dark:border-brand-500/20 dark:bg-brand-500/10">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
            <p className="text-xs leading-relaxed text-brand-700 dark:text-brand-300">
              Buat akun admin pertama untuk mengelola {import.meta.env.VITE_SITE_NAME || "NQDRIVE"}. Halaman ini hanya muncul sekali.
            </p>
          </div>

          {/* Divider */}
          <div className="mb-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
            <span className="text-xs text-zinc-400 dark:text-zinc-500">Buat akun admin</span>
            <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">

            {/* Username */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="username" className={labelClass}>Username</label>
              <div className="relative">
                <User className={iconClass} />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={3}
                  maxLength={32}
                  autoComplete="username"
                  autoFocus
                  placeholder="Masukkan username"
                  className={inputClass}
                />
              </div>
            </div>

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className={labelClass}>Email</label>
              <div className="relative">
                <svg className={iconClass} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="20" height="16" x="2" y="4" rx="2"/>
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="Masukkan email"
                  className={inputClass}
                />
              </div>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className={labelClass}>Password</label>
              <div className="relative">
                <Lock className={iconClass} />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Minimal 8 karakter"
                  className={inputWithToggleClass}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirmPassword" className={labelClass}>Konfirmasi Password</label>
              <div className="relative">
                <Lock className={iconClass} />
                <input
                  id="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="Ulangi password"
                  className={inputWithToggleClass}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {formError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-500/20 dark:bg-red-500/10">
                <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={setupAdmin.isPending}
              className="
                mt-1 h-11 w-full rounded-xl bg-brand-500 text-sm font-semibold text-white
                shadow-lg shadow-brand-500/25 transition-all
                hover:bg-brand-600 hover:shadow-brand-600/30
                active:scale-[0.98]
                disabled:cursor-not-allowed disabled:opacity-60
              "
            >
              {setupAdmin.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Menyimpan...
                </span>
              ) : (
                "Buat Akun Admin"
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-600">
          Secure Cloud Storage &copy; {new Date().getFullYear()}
        </p>
      </motion.div>
    </div>
  );
}
