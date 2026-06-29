import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, Lock, User } from "lucide-react";
import { NqdriveLogo } from "@nqdrive/ui";
import { useLogin } from "../hooks/use-auth";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const login = useLogin();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
    /* Light mode: abu muda. Dark mode: zinc-950. Ikut tema sistem. */
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-100 px-4 dark:bg-zinc-950">

      {/* Blob dekoratif — subtle di light, lebih jelas di dark */}
      <div
        className="pointer-events-none absolute -top-40 -left-40 h-[480px] w-[480px] rounded-full opacity-30 dark:opacity-20"
        style={{ background: "radial-gradient(circle, #10b981 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-40 -right-20 h-[380px] w-[380px] rounded-full opacity-20 dark:opacity-10"
        style={{ background: "radial-gradient(circle, #059669 0%, transparent 70%)" }}
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">

          {/* Logo + branding */}
          <div className="mb-8 flex flex-col items-center gap-3">
            {/* Container icon — brand-500 bg agar logo kontras di semua tema */}
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500 shadow-lg shadow-brand-500/30">
              {/* Logo dengan warna putih eksplisit agar kontras di atas brand-500 */}
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

            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
                NQ<span className="text-brand-600 dark:text-brand-400">DRIVE</span>
              </h1>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Admin Dashboard</p>
            </div>
          </div>

          {/* Divider */}
          <div className="mb-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
            <span className="text-xs text-zinc-400 dark:text-zinc-500">Masuk ke akun Anda</span>
            <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Username */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="username"
                className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
              >
                Username
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
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
                    dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100
                    dark:placeholder-zinc-500 dark:focus:border-brand-500 dark:focus:bg-zinc-800
                  "
                />
              </div>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
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
                    dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100
                    dark:placeholder-zinc-500 dark:focus:border-brand-500 dark:focus:bg-zinc-800
                  "
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {formError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-950">
                <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={login.isPending}
              className="
                mt-1 h-11 w-full rounded-xl bg-brand-500 text-sm font-semibold text-white
                shadow-md shadow-brand-500/25 transition-all
                hover:bg-brand-600 hover:shadow-brand-600/30
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

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-600">
          NQDRIVE &copy; {new Date().getFullYear()} — Secure Cloud Storage
        </p>
      </div>
    </div>
  );
}
