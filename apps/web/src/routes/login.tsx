import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { Eye, EyeOff, Lock, User } from "lucide-react";
import { motion } from "framer-motion";
import { useLogin, useMe } from "../hooks/auth";
import { Particles } from "@nqdrive/ui";
import { LoadingOverlay } from "../components/overlay";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

const MIN_OVERLAY_MS = 1800;

function LoginPage() {
  const navigate = useNavigate();
  const login = useLogin();
  const { data: user, isLoading: isCheckingAuth, isFetched } = useMe();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [showOverlay, setShowOverlay] = useState(true);
  const mountedAt = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tentukan kapan auth check "selesai":
  // - useMe disabled (localStorage false) → isFetched false, isLoading false, user undefined → langsung selesai
  // - useMe enabled → tunggu isLoading jadi false
  const authResolved = !isCheckingAuth;

  useEffect(() => {
    if (!authResolved) return;

    // Sudah login → redirect ke dashboard (tanpa tunggu timer)
    if (user) {
      navigate({ to: "/dashboard", replace: true });
      return;
    }

    // Belum login → tunggu minimum overlay duration
    const elapsed = Date.now() - mountedAt.current;
    const remaining = Math.max(0, MIN_OVERLAY_MS - elapsed);

    timerRef.current = setTimeout(() => {
      setShowOverlay(false);
    }, remaining);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [authResolved, user, navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    try {
      await login.mutateAsync({ username, password });
      navigate({ to: "/dashboard" });
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Login gagal. Periksa kredensial Anda."
      );
    }
  };

  return (
    <>
      <LoadingOverlay visible={showOverlay} message="Memuat..." />

      {!showOverlay && (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-100 px-4 dark:bg-zinc-950">

          <Particles
            className="absolute inset-0 z-0"
            quantity={300}
            ease={80}
            color="#10b981"
            refresh
          />

          <div
            className="pointer-events-none absolute -top-60 -left-60 h-[600px] w-[600px] rounded-full opacity-30 dark:opacity-100"
            style={{ background: "radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 65%)" }}
          />
          <div
            className="pointer-events-none absolute -bottom-40 -right-20 h-[400px] w-[400px] rounded-full opacity-20 dark:opacity-100"
            style={{ background: "radial-gradient(circle, rgba(5,150,105,0.08) 0%, transparent 65%)" }}
          />

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
            className="relative z-10 w-full max-w-sm"
          >
            <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-xl dark:border-white/10 dark:bg-white/5 dark:shadow-2xl dark:backdrop-blur-xl dark:ring-1 dark:ring-white/5">

              <div className="mb-8 flex flex-col items-center gap-3">
                <img
                  src="/logologon.png"
                  alt="Logo"
                  className="h-28 w-auto object-contain"
                />
              </div>

              <div className="mb-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
                <span className="text-xs text-zinc-400 dark:text-zinc-500">Masuk ke akun Anda</span>
                <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="username"
                    className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                  >
                    Username
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
                    <input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      autoComplete="username"
                      autoFocus
                      placeholder="Masukkan username"
                      className="
                        h-11 w-full rounded-xl border border-zinc-300 bg-zinc-50
                        pl-10 pr-4 text-sm text-zinc-900 placeholder-zinc-400
                        outline-none transition-all
                        focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20
                        dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder-zinc-600
                        dark:focus:border-brand-500/60 dark:focus:bg-white/8
                      "
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="password"
                    className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      placeholder="Masukkan password"
                      className="
                        h-11 w-full rounded-xl border border-zinc-300 bg-zinc-50
                        pl-10 pr-11 text-sm text-zinc-900 placeholder-zinc-400
                        outline-none transition-all
                        focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20
                        dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder-zinc-600
                        dark:focus:border-brand-500/60 dark:focus:bg-white/8
                      "
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

                {formError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-500/20 dark:bg-red-500/10">
                    <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={login.isPending}
                  className="
                    mt-1 h-11 w-full rounded-xl bg-brand-500 text-sm font-semibold text-white
                    shadow-lg shadow-brand-500/25 transition-all
                    hover:bg-brand-400 hover:shadow-brand-500/40
                    active:scale-[0.98]
                    disabled:cursor-not-allowed disabled:opacity-60
                  "
                >
                  {login.isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Memproses...
                    </span>
                  ) : (
                    "Masuk"
                  )}
                </button>
              </form>
            </div>

            <p className="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-600">
              Secure Cloud Storage &copy; {new Date().getFullYear()}
            </p>
          </motion.div>
        </div>
      )}
    </>
  );
}
