import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck, Loader2, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Particles } from "@nqdrive/ui";
import { LoadingOverlay } from "../components/overlay";
import { logoLoginPng } from "../assets";
import { authService } from "../services/auth.service";
import { useMe } from "../hooks/auth";
import { useTheme } from "../stores/theme-provider";

export const Route = createFileRoute("/2fa-required")({
  component: TwoFactorPage,
});

function TwoFactorPage() {
  const navigate = useNavigate();
  const { refetch: refetchMe } = useMe(false);
  const { theme } = useTheme();

  const [otpCode, setOtpCode] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifySuccess, setVerifySuccess] = useState(false);
  const [showContent, setShowContent] = useState(false);

  const tempToken = typeof window !== "undefined" ? sessionStorage.getItem("nqdrive_2fa_temp") : null;

  useEffect(() => {
    if (!tempToken) {
      navigate({ to: "/login", replace: true });
      return;
    }
    const timer = setTimeout(() => setShowContent(true), 150);
    return () => clearTimeout(timer);
  }, [tempToken, navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!otpCode.trim() || !tempToken) return;

    setFormError(null);
    setIsVerifying(true);

    try {
      await authService.login2fa({
        tempToken,
        code: otpCode.trim(),
      });
      sessionStorage.removeItem("nqdrive_2fa_temp");
      localStorage.setItem("nqdrive_is_logged_in", "true");
      await refetchMe();

      setIsVerifying(false);
      setVerifySuccess(true);

      setTimeout(() => {
        navigate({ to: "/dashboard" });
      }, 1800);
    } catch (error: any) {
      setFormError(error?.message || "Kode 2FA salah. Silakan coba lagi.");
      setIsVerifying(false);
    }
  };

  if (!tempToken) {
    return <LoadingOverlay visible message="Memuat..." />;
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-100 px-4 dark:bg-zinc-950">
      <Particles className="absolute inset-0 z-0" quantity={300} ease={80} color="#10b981" refresh />
      <div
        className="pointer-events-none absolute -top-60 -left-60 h-[600px] w-[600px] rounded-full opacity-30 dark:opacity-100"
        style={{ background: "radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 65%)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-40 -right-20 h-[400px] w-[400px] rounded-full opacity-20 dark:opacity-100"
        style={{ background: "radial-gradient(circle, rgba(5,150,105,0.08) 0%, transparent 65%)" }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={showContent ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1], delay: 0.1 }}
        className="relative z-10 w-full max-w-sm"
      >
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-xl dark:border-white/10 dark:bg-white/5 dark:shadow-2xl dark:backdrop-blur-xl dark:ring-1 dark:ring-white/5">
          <AnimatePresence mode="wait">
            {verifySuccess ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", damping: 20, stiffness: 300 }}
                className="flex flex-col items-center gap-4 py-6"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", damping: 15, stiffness: 400, delay: 0.1 }}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-500/15"
                >
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.25 }}
                  className="text-center"
                >
                  <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    Verifikasi Berhasil
                  </h2>
                  <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                    Mengalihkan ke dashboard...
                  </p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.4 }}
                >
                  <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
                </motion.div>
              </motion.div>
            ) : (
              <motion.div
                key="form"
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                {/* Header */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={showContent ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.5, delay: 0.25, ease: [0.4, 0, 0.2, 1] }}
                  className="mb-6 flex flex-col items-center gap-4"
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 shadow-lg shadow-brand-500/10 dark:bg-brand-500/10 dark:shadow-brand-500/5">
                    <ShieldCheck className="h-8 w-8 text-brand-500" />
                  </div>
                  <div className="text-center">
                    <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                      Otentikasi 2FA
                    </h1>
                    <p className="mt-1.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                      Masukkan kode 6 digit dari aplikasi authenticator Anda
                    </p>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={showContent ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
                  transition={{ duration: 0.5, delay: 0.4, ease: [0.4, 0, 0.2, 1] }}
                >
                  <div className="mb-5 flex items-center gap-3">
                    <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
                    <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                      Verifikasi
                    </span>
                    <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
                  </div>

                  <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="otp" className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Kode 2FA
                      </label>
                      <input
                        id="otp"
                        type="text"
                        value={otpCode}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, "").slice(0, 6);
                          setOtpCode(val);
                        }}
                        required
                        placeholder="000000"
                        className="h-14 w-full rounded-xl border border-zinc-300 bg-zinc-50 text-center text-2xl font-bold tracking-[0.5em] text-zinc-900 placeholder-zinc-300 outline-none transition-all focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder-zinc-700 dark:focus:border-brand-500/60 dark:focus:bg-white/8 font-mono"
                        autoFocus
                        maxLength={6}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        disabled={isVerifying}
                      />
                    </div>

                    {formError && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-500/20 dark:bg-red-500/10"
                      >
                        <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
                      </motion.div>
                    )}

                    <button
                      type="submit"
                      disabled={isVerifying || otpCode.length < 6}
                      className="mt-1 h-11 w-full rounded-xl bg-brand-500 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 transition-all hover:bg-brand-400 hover:shadow-brand-500/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isVerifying ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Memverifikasi...
                        </span>
                      ) : "Verifikasi"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        sessionStorage.removeItem("nqdrive_2fa_temp");
                        navigate({ to: "/login" });
                      }}
                      className="text-xs text-center text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 mt-1 transition-colors"
                    >
                      Kembali ke halaman login
                    </button>
                  </form>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <p className="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-600">
          Secure Cloud Storage &copy; {new Date().getFullYear()}
        </p>
      </motion.div>
    </div>
  );
}