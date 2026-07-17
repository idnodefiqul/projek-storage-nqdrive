import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef, useCallback } from "react";
import { Eye, EyeOff, Lock, User, Loader2, ShieldCheck, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLogin, useMe } from "../hooks/auth";
import { GridPatternBackground } from "@nqdrive/ui";
import { LoadingOverlay } from "../components/overlay";
import { logoLoginPng } from "../assets";
import { applyBrandColors, useTheme } from "../stores/theme-provider";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const login = useLogin();
  const { data: user, isLoading: isCheckingAuth } = useMe();
  const { theme } = useTheme();

  // Credentials form state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);

  // Turnstile captcha state
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [turnstileSitekey, setTurnstileSitekey] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetId = useRef<string | null>(null);
  const turnstileScriptLoaded = useRef(false);
  const turnstileRendered = useRef(false);

  // Captcha popup state
  const [showCaptchaPopup, setShowCaptchaPopup] = useState(false);
  const [captchaReady, setCaptchaReady] = useState(false);
  const pendingSubmit = useRef(false);

  // Auth checking redirect
  useEffect(() => {
    if (!isCheckingAuth && user) {
      navigate({ to: "/dashboard", replace: true });
      return;
    }
    if (!isCheckingAuth && !user) {
      const timer = setTimeout(() => setShowOverlay(false), 1200);
      return () => clearTimeout(timer);
    }
  }, [isCheckingAuth, user, navigate]);

  // Sync brand color & theme mode dari /config publik (DB = source of truth)
  useEffect(() => {
    const WORKER_BASE = (import.meta.env.VITE_WORKER_URL as string | undefined) ?? "";
    fetch(`${WORKER_BASE}/config`, { headers: { "X-App-Client": "nqdrive-web" } })
      .then((res) => res.json())
      .then((json: any) => {
        if (json?.success && json?.data) {
          const cfg = json.data as { brand_color?: string; theme_mode?: string };
          if (cfg.brand_color) {
            // Format: "primary:accent" (gradient) atau "primary" (solid).
            const parts = cfg.brand_color.split(":");
            const primary = parts[0] ?? cfg.brand_color;
            const accent = parts.length === 2 && parts[1] && /^#[0-9a-fA-F]{6}$/.test(parts[1]) ? parts[1] : null;
            if (primary && /^#[0-9a-fA-F]{3,8}$/.test(primary)) {
              applyBrandColors(primary);
              if (accent) {
                document.documentElement.style.setProperty("--brand-fill", `linear-gradient(160deg, ${primary}, ${accent})`);
                document.documentElement.style.setProperty("--brand-b", accent);
              }
            }
          }
          if (cfg.theme_mode === "dark") document.documentElement.classList.add("dark");
          else if (cfg.theme_mode === "light") document.documentElement.classList.remove("dark");
        }
      })
      .catch(() => {});
  }, []);

  // Fetch public settings (Turnstile config) on mount
  useEffect(() => {
    const WORKER_BASE = (import.meta.env.VITE_WORKER_URL as string | undefined) ?? "";
    fetch(`${WORKER_BASE}/captcha`, {
      credentials: "include",
      headers: { "X-App-Client": "nqdrive-web" },
    })
      .then((res) => res.json())
      .then((json: any) => {
        if (json?.data?.turnstile_enabled) {
          setTurnstileEnabled(true);
          setTurnstileSitekey(json.data.turnstile_sitekey || "");
        }
      })
      .catch(() => {});
  }, []);

  // Detect current theme for Turnstile widget
  const getTurnstileTheme = useCallback((): "light" | "dark" => {
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  }, []);

  // Explicit render helper - only renders ONCE per mount cycle
  const renderTurnstileWidget = useCallback(() => {
    if (
      turnstileRendered.current ||
      !turnstileScriptLoaded.current ||
      !turnstileRef.current ||
      typeof (window as any).turnstile === "undefined"
    ) return;
    turnstileRendered.current = true;
    turnstileWidgetId.current = (window as any).turnstile.render(turnstileRef.current, {
      sitekey: turnstileSitekey,
      theme: getTurnstileTheme(),
      callback: (token: string) => {
        setTurnstileToken(token);
      },
      "expired-callback": () => { setTurnstileToken(""); },
    });
  }, [turnstileSitekey, getTurnstileTheme]);

  // Auto-submit after captcha verified inside popup
  useEffect(() => {
    if (turnstileToken && pendingSubmit.current) {
      pendingSubmit.current = false;
      setShowCaptchaPopup(false);
      setCaptchaReady(false);
      doLogin(turnstileToken);
    }
  }, [turnstileToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-render Turnstile widget when theme changes
  useEffect(() => {
    if (!turnstileRendered.current || !turnstileRef.current || typeof (window as any).turnstile === "undefined") return;
    if (turnstileWidgetId.current != null) {
      try { (window as any).turnstile.remove(turnstileWidgetId.current); } catch {}
      turnstileWidgetId.current = null;
    }
    turnstileRendered.current = false;
    renderTurnstileWidget();
  }, [theme]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load Turnstile Script dynamically when enabled & sitekey is set
  useEffect(() => {
    if (turnstileEnabled && turnstileSitekey) {
      turnstileRendered.current = false;
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.onload = () => {
        turnstileScriptLoaded.current = true;
        renderTurnstileWidget();
      };
      document.head.appendChild(script);

      return () => {
        if (turnstileWidgetId.current != null && typeof (window as any).turnstile !== "undefined") {
          try { (window as any).turnstile.remove(turnstileWidgetId.current); } catch {}
          turnstileWidgetId.current = null;
        }
        turnstileRendered.current = false;
        turnstileScriptLoaded.current = false;
        if (document.head.contains(script)) {
          document.head.removeChild(script);
        }
      };
    }
  }, [turnstileEnabled, turnstileSitekey, renderTurnstileWidget]);

  // Delay showing captcha widget inside popup for smooth animation
  useEffect(() => {
    if (showCaptchaPopup) {
      setCaptchaReady(false);
      const timer = setTimeout(() => setCaptchaReady(true), 350);
      return () => clearTimeout(timer);
    } else {
      setCaptchaReady(false);
    }
  }, [showCaptchaPopup]);

  // Re-render widget when popup content is ready (DOM element becomes available)
  useEffect(() => {
    if (captchaReady && turnstileScriptLoaded.current && turnstileRef.current) {
      if (turnstileWidgetId.current != null) {
        try { (window as any).turnstile.remove(turnstileWidgetId.current); } catch {}
        turnstileWidgetId.current = null;
      }
      turnstileRendered.current = false;
      renderTurnstileWidget();
    }
  }, [captchaReady, renderTurnstileWidget]);

  // Ref callback - stable
  const turnstileRefCallback = useCallback((el: HTMLDivElement | null) => {
    turnstileRef.current = el;
    if (el && turnstileScriptLoaded.current) {
      if (turnstileWidgetId.current != null) {
        try { (window as any).turnstile.remove(turnstileWidgetId.current); } catch {}
        turnstileWidgetId.current = null;
      }
      turnstileRendered.current = false;
      renderTurnstileWidget();
    }
  }, [renderTurnstileWidget]);

  // Core login logic
  const doLogin = async (captchaToken?: string) => {
    setFormError(null);
    try {
      const res = await login.mutateAsync({
        username,
        password,
        turnstileToken: turnstileEnabled ? captchaToken : undefined,
      });

      if (res.twoFactorRequired && res.tempToken) {
        sessionStorage.setItem("nqdrive_2fa_temp", res.tempToken);
        navigate({ to: "/2fa-required" });
      } else {
        navigate({ to: "/dashboard" });
      }
    } catch (error: any) {
      setFormError(error?.message || "Login gagal. Periksa kredensial Anda.");
      setTurnstileToken("");
      if (typeof (window as any).turnstile !== "undefined") {
        try { (window as any).turnstile.reset(); } catch {}
      }
    }
  };

  // Handle form submit
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!username.trim() || !password.trim()) {
      setFormError("Username dan password wajib diisi.");
      return;
    }

    if (turnstileEnabled) {
      if (turnstileToken) {
        doLogin(turnstileToken);
      } else {
        pendingSubmit.current = true;
        setShowCaptchaPopup(true);
      }
    } else {
      doLogin();
    }
  };

  // Close captcha popup
  const closeCaptchaPopup = () => {
    pendingSubmit.current = false;
    setShowCaptchaPopup(false);
    setCaptchaReady(false);
  };

  if (showOverlay) {
    return <LoadingOverlay visible message="Memuat..." />;
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-100 px-4 dark:bg-zinc-950">
      <GridPatternBackground />
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
            <img src={logoLoginPng} alt="Logo" className="h-28 w-auto object-contain" />
          </div>

          <div className="mb-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
            <span className="text-xs text-zinc-400 dark:text-zinc-500">Masuk ke akun Anda</span>
            <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="username" className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
                <input id="username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username" autoFocus placeholder="Masukkan username" className="h-11 w-full rounded-xl border border-zinc-300 bg-zinc-50 pl-10 pr-4 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition-all focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder-zinc-600 dark:focus:border-brand-500/60 dark:focus:bg-white/8" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
                <input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" placeholder="Masukkan password" className="h-11 w-full rounded-xl border border-zinc-300 bg-zinc-50 pl-10 pr-11 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition-all focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder-zinc-600 dark:focus:border-brand-500/60 dark:focus:bg-white/8" />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300" tabIndex={-1}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {formError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-500/20 dark:bg-red-500/10">
                <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
              </div>
            )}

            <button type="submit" disabled={login.isPending} className="mt-1 h-11 w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 transition-all hover:from-brand-400 hover:to-brand-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60">
              {login.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Memproses...
                </span>
              ) : "Masuk"}
            </button>
          </form>
        </div>
        <p className="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-600">
          Secure Cloud Storage &copy; {new Date().getFullYear()}
        </p>
      </motion.div>

      {/* Captcha Popup Modal */}
      <AnimatePresence>
        {showCaptchaPopup && (
          <>
            {/* Backdrop blur */}
            <motion.div
              key="captcha-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={closeCaptchaPopup}
            />

            {/* Modal card */}
            <motion.div
              key="captcha-modal"
              initial={{ opacity: 0, scale: 0.9, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 24 }}
              transition={{ type: "spring", damping: 25, stiffness: 300, delay: 0.05 }}
              className="fixed inset-0 z-50 flex items-center justify-center px-4"
            >
              <div className="relative w-full max-w-[340px] rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-900 dark:shadow-black/40 dark:ring-1 dark:ring-white/5">
                {/* Close button */}
                <button
                  onClick={closeCaptchaPopup}
                  className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-white/10 dark:hover:text-zinc-300"
                >
                  <X className="h-4 w-4" />
                </button>

                {/* Header with delayed entrance */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.15 }}
                  className="mb-5 flex flex-col items-center gap-3"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-500/10">
                    <ShieldCheck className="h-6 w-6 text-brand-500" />
                  </div>
                  <div className="text-center">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      Verifikasi Keamanan
                    </h3>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      Selesaikan captcha untuk melanjutkan login
                    </p>
                  </div>
                </motion.div>

                {/* Turnstile widget with delayed render */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: captchaReady ? 1 : 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center justify-center min-h-[65px]"
                >
                  {captchaReady ? (
                    <div
                      ref={turnstileRefCallback}
                      className="flex items-center justify-center"
                    />
                  ) : (
                    <div className="flex items-center justify-center gap-2 text-zinc-400 dark:text-zinc-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-xs">Memuat captcha...</span>
                    </div>
                  )}
                </motion.div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}