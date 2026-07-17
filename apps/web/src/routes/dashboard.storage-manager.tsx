import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import {
  Eye, EyeOff, Database, RefreshCw, Plus, Trash2, KeyRound,
  CheckCircle2, XCircle, Loader2, ExternalLink, AlertCircle,
  ChevronDown, ShieldCheck, AlertTriangle, HardDrive, ArrowLeftRight, Power,
} from "lucide-react";
import {
  Card, CardContent, CardHeader, CardTitle, Badge, Progress, Skeleton,
  TooltipProvider, Tooltip, TooltipTrigger, TooltipContent,
  Button, Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Input, useToast,
  Avatar, AvatarImage, AvatarFallback,
} from "@nqdrive/ui";
import { formatBytes } from "@nqdrive/shared";
import {
  useStorageManagerSummary, useSyncAllAccounts,
  useDriveAccounts, useDeleteDriveAccount,
  useConnectGoogleAccountViaToken, useValidateRefreshToken,
  useGoogleOAuthUrl,
  useFormatDriveAccount,
} from "../hooks/use-drive-accounts";
import { useMinLoading } from "../hooks/use-min-loading";
import { useMigrationGlobal } from "../stores/migration-provider";
import type { DriveAccountWithFileCount } from "../services/drive-account.service";
import { PageTransition } from "../components/page-transition";
import { PageHeader } from "../components/ui-kit";
import { CardGridSkeleton } from "../components/skeletons";
import { ApiClientError } from "../lib/client";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { googleDriveSvg, onedriveSvg } from "../assets";
import { SiDropbox } from "@icons-pack/react-simple-icons";

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] } },
};

export const Route = createFileRoute("/dashboard/storage-manager")({
  component: GoogleDrivePage,
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  return `${local.slice(0, 3)}***@${domain}`;
}

function EmailCell({ email, size = "sm" }: { email: string; size?: "sm" | "xs" }) {
  const [shown, setShown] = useState(false);
  const displayEmail = shown ? email : maskEmail(email);

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`truncate font-medium text-[rgb(var(--foreground))] ${size === "xs" ? "text-xs" : "text-sm"}`}>
              {displayEmail}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{email}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <button type="button" onClick={() => setShown((v) => !v)}
        className="shrink-0 text-[rgb(var(--ink-500))] transition-colors hover:text-brand-500"
        title={shown ? "Sembunyikan email" : "Tampilkan email"}>
        {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// ─── ADD ACCOUNT DIALOG ───────────────────────────────────────────────────────

function AddAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [refreshToken, setRefreshToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [validationState, setValidationState] = useState<
    null | { valid: true; email: string } | { valid: false; reason: string }
  >(null);
  const [formError, setFormError] = useState<string | null>(null);

  const connectMutation = useConnectGoogleAccountViaToken();
  const validateMutation = useValidateRefreshToken();
  const oauthUrlMutation = useGoogleOAuthUrl();

  const handleClose = () => {
    setRefreshToken(""); setValidationState(null);
    setFormError(null); setShowToken(false); setShowManual(false);
    connectMutation.reset(); validateMutation.reset(); oauthUrlMutation.reset();
    onClose();
  };

  // Cara direkomendasikan: minta URL consent Google lalu redirect. Setelah admin
  // mengizinkan, Google kembali ke worker callback yang menyimpan akun otomatis
  // dan redirect balik ke halaman ini dengan ?oauth=success.
  const handleGoogleLogin = async () => {
    setFormError(null);
    try {
      const { url } = await oauthUrlMutation.mutateAsync();
      window.location.href = url;
    } catch (error) {
      let msg = "Gagal memulai login Google. Coba lagi.";
      if (error instanceof ApiClientError || error instanceof Error) msg = error.message;
      setFormError(msg);
    }
  };

  const handleValidate = async () => {
    const token = refreshToken.trim();
    if (!token) return;
    setValidationState(null); setFormError(null);
    try {
      const result = await validateMutation.mutateAsync(token);
      if (result.valid && result.email) setValidationState({ valid: true, email: result.email });
      else setValidationState({ valid: false, reason: result.reason ?? "Token tidak valid." });
    } catch (error) {
      let msg = "Gagal menghubungi server. Periksa koneksi internet.";
      if (error instanceof ApiClientError || error instanceof Error) msg = error.message;
      setFormError(msg);
    }
  };

  const handleConnect = async () => {
    setFormError(null);
    try {
      const result = await connectMutation.mutateAsync(refreshToken.trim());
      toast({ title: "Akun berhasil ditambahkan", description: result.account.email, variant: "success" });
      handleClose();
    } catch (error) {
      let msg = "Terjadi kesalahan. Coba lagi.";
      if (error instanceof ApiClientError || error instanceof Error) msg = error.message;
      toast({ title: "Gagal menambahkan akun", description: msg, variant: "error" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()} className="max-w-xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <img src={googleDriveSvg} alt="" className="h-5 w-5" />
          Tambah Akun Google Drive
        </DialogTitle>
        <DialogDescription>Hubungkan akun Google Drive ke storage pool.</DialogDescription>
      </DialogHeader>

      {/* ── Cara 1: Login dengan Google (DIREKOMENDASIKAN) ── */}
      <div className="rounded-xl border-2 border-brand-500/40 bg-brand-50/50 p-4 dark:border-brand-500/30 dark:bg-brand-950/20">
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-white">
            <ShieldCheck className="h-3 w-3" /> Direkomendasikan
          </span>
          <span className="text-xs text-[rgb(var(--ink-500))]">Paling mudah &amp; token tidak cepat kadaluarsa</span>
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={oauthUrlMutation.isPending}
          className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))]
            text-sm font-medium text-[rgb(var(--ink-500))] shadow-sm transition-all hover:bg-[rgb(var(--surface-muted))] hover:shadow
            disabled:cursor-not-allowed disabled:opacity-60
            dark:border-[rgb(var(--border-subtle))] dark:bg-[rgb(var(--surface-muted))] dark:text-[rgb(var(--foreground))] dark:hover:bg-[rgb(var(--surface-muted))]"
        >
          {oauthUrlMutation.isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Mengalihkan ke Google...</>
          ) : (
            <>
              <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Login dengan Google
            </>
          )}
        </button>

        <p className="mt-2.5 text-[11px] leading-relaxed text-[rgb(var(--ink-500))]">
          Kamu akan diarahkan ke halaman izin Google. Setelah menekan <strong>Izinkan</strong>,
          akun otomatis terhubung — tanpa perlu menyalin token.
        </p>
      </div>

      {formError && (
        <div className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-800 dark:bg-orange-950">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
          <p className="text-sm text-orange-700 dark:text-orange-300">{formError}</p>
        </div>
      )}

      {/* ── Cara 2: Refresh token manual (fallback, disembunyikan) ── */}
      <div className="border-t border-[rgb(var(--border-subtle))] pt-3 dark:border-[rgb(var(--border-subtle))]">
        <button
          onClick={() => setShowManual((v) => !v)}
          className="flex w-full items-center justify-between text-sm font-medium text-[rgb(var(--ink-500))] transition-colors hover:text-[rgb(var(--ink-500))] dark:text-[rgb(var(--ink-500))] dark:hover:text-[rgb(var(--foreground))]"
        >
          <span className="flex items-center gap-1.5">
            <KeyRound className="h-4 w-4" />
            Cara lama: masukkan Refresh Token manual
          </span>
          <ChevronDown className={`h-4 w-4 transition-transform ${showManual ? "rotate-180" : ""}`} />
        </button>

        {showManual && (
          <div className="mt-3 flex flex-col gap-3">
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 dark:border-blue-800 dark:bg-blue-950">
              <p className="mb-1.5 text-xs font-semibold text-blue-800 dark:text-blue-200">Cara mendapatkan Refresh Token:</p>
              <ol className="ml-4 list-decimal space-y-1">
                <li className="text-xs text-blue-700 dark:text-blue-300">
                  Buka <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 font-medium underline underline-offset-2">
                    Google OAuth Playground <ExternalLink className="h-3 w-3" /></a>
                </li>
                <li className="text-xs text-blue-700 dark:text-blue-300">Klik ⚙️ → centang <em>Use your own OAuth credentials</em> → isi Client ID &amp; Secret</li>
                <li className="text-xs text-blue-700 dark:text-blue-300">Pilih scope: <code className="rounded bg-blue-100 px-1 py-0.5 font-mono text-[11px] dark:bg-blue-900">https://www.googleapis.com/auth/drive</code></li>
                <li className="text-xs text-blue-700 dark:text-blue-300">Klik <em>Authorize APIs</em> → login → <em>Exchange authorization code for tokens</em></li>
                <li className="text-xs text-blue-700 dark:text-blue-300">Copy nilai <strong>Refresh token</strong> dari response JSON</li>
              </ol>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[rgb(var(--ink-500))] dark:text-[rgb(var(--foreground))]">Refresh Token</label>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <input type={showToken ? "text" : "password"} value={refreshToken}
                    onChange={(e) => { setRefreshToken(e.target.value); setValidationState(null); setFormError(null); }}
                    placeholder="1//0g..."
                    className="h-10 w-full rounded-lg border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] pl-3 pr-10 font-mono text-sm
                      text-[rgb(var(--foreground))] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30
                      disabled:cursor-not-allowed disabled:opacity-50
                      dark:border-[rgb(var(--border-subtle))] dark:bg-[rgb(var(--surface))] dark:text-[rgb(var(--foreground))]"
                    disabled={connectMutation.isPending}
                    onKeyDown={(e) => e.key === "Enter" && !validationState && !validateMutation.isPending && handleValidate()} />
                  <button type="button" onClick={() => setShowToken((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgb(var(--ink-500))] transition-colors hover:text-[rgb(var(--ink-500))]"
                    tabIndex={-1}>
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button variant="outline" size="sm"
                  onClick={handleValidate}
                  disabled={!refreshToken.trim() || validateMutation.isPending || connectMutation.isPending}
                  className="h-10 shrink-0">
                  {validateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" />
                    : validationState ? <><RefreshCw className="mr-1 h-3.5 w-3.5" />Ulang</> : "Cek Token"}
                </Button>
              </div>
            </div>

            {validationState && (
              <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                validationState.valid
                  ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
                  : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"}`}>
                {validationState.valid
                  ? <><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-medium">Token valid ✓</p><p className="mt-0.5 font-mono text-xs">{validationState.email}</p></div></>
                  : <><XCircle className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-medium">Token tidak valid</p><p className="mt-0.5 text-xs">{validationState.reason}</p></div></>}
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={handleConnect} disabled={connectMutation.isPending || !validationState || !validationState.valid}>
                {connectMutation.isPending
                  ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Menambahkan...</>
                  : <><Plus className="mr-1 h-4 w-4" />Tambahkan Akun</>}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-[rgb(var(--border-subtle))] pt-3 dark:border-[rgb(var(--border-subtle))]">
        <Button variant="outline" onClick={handleClose} disabled={connectMutation.isPending || oauthUrlMutation.isPending} className="border-[rgb(var(--border-subtle))] dark:border-[rgb(var(--border-subtle))] dark:text-[rgb(var(--foreground))] dark:bg-[rgb(var(--surface-muted))] hover:bg-[rgb(var(--surface-muted))] dark:hover:bg-[rgb(var(--surface-muted))]">Tutup</Button>
      </div>
    </Dialog>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────


function ConfirmFormatDriveDialog({
  open,
  onClose,
  onConfirm,
  accountEmail,
  fileCount,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  accountEmail: string;
  fileCount: number;
  isPending: boolean;
}) {
  const [confirmText, setConfirmText] = useState("");
  const matches = confirmText === accountEmail;

  const handleClose = () => { setConfirmText(""); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogHeader>
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <DialogTitle>Format Drive?</DialogTitle>
        </div>
        <DialogDescription className="pl-[52px]">
          <strong className="text-[rgb(var(--foreground))]">Seluruh isi Google Drive</strong> akun{" "}
          <strong className="text-[rgb(var(--foreground))]">{accountEmail}</strong>{" "}
          akan dihapus permanen — termasuk{" "}
          <strong className="text-[rgb(var(--foreground))]">{fileCount} file</strong> yang tercatat
          di dashboard, file lain di drive, dan isi trash. Akun tetap terhubung.
        </DialogDescription>
      </DialogHeader>
      <div className="mx-4 mb-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-3">
        <p className="text-xs text-red-700 dark:text-red-400 font-medium">
          Tindakan ini tidak bisa dibatalkan. Seluruh file akan hilang selamanya dari Google Drive.
        </p>
      </div>
      <div className="mx-4 mb-2 flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[rgb(var(--ink-500))] dark:text-[rgb(var(--ink-500))]">
          Ketik <strong className="text-[rgb(var(--foreground))] select-all">{accountEmail}</strong> untuk konfirmasi
        </label>
        <Input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={accountEmail}
          className="font-mono text-sm"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <DialogFooter>
        <Button variant="outline" className="border-[rgb(var(--border-subtle))] dark:border-[rgb(var(--border-subtle))] dark:text-[rgb(var(--foreground))] dark:bg-[rgb(var(--surface-muted))] hover:bg-[rgb(var(--surface-muted))] dark:hover:bg-[rgb(var(--surface-muted))] shrink-0" onClick={handleClose} disabled={isPending}>
          Batal
        </Button>
        <Button variant="destructive" onClick={onConfirm} disabled={!matches || isPending}>
          {isPending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Memformat...</>
          ) : (
            <><HardDrive className="mr-2 h-4 w-4" />Format Drive</>
          )}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
const MIGRATION_RESERVE_BYTES = 1 * 1024 * 1024 * 1024; // cadangan 1 GB, sama dengan worker

function ConfirmMigrateDriveDialog({
  open,
  onClose,
  onConfirm,
  sourceAccount,
  accounts,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (targetAccountId: number) => void;
  sourceAccount: { id: number; email: string; fileCount: number; usedBytes: number } | null;
  accounts: DriveAccountWithFileCount[];
  isPending: boolean;
}) {
  const [targetId, setTargetId] = useState<number | null>(null);
  const [confirmText, setConfirmText] = useState("");

  // Reset pilihan setiap dialog dibuka — dialog ditutup programatik setelah
  // sukses sehingga handleClose tidak selalu terpanggil.
  useEffect(() => {
    if (open) {
      setTargetId(null);
      setConfirmText("");
    }
  }, [open]);

  const sourceEmail = sourceAccount?.email ?? "";
  const matches = confirmText === sourceEmail && targetId !== null;
  const neededBytes = (sourceAccount?.usedBytes ?? 0) + MIGRATION_RESERVE_BYTES;

  // Kandidat target: akun lain yang online. Yang ruangnya kurang tetap tampil tapi disabled.
  const candidates = accounts.filter((account) => account.id !== sourceAccount?.id);

  const handleClose = () => {
    setTargetId(null);
    setConfirmText("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogHeader>
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <ArrowLeftRight className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <DialogTitle>Migrasi Isi Drive?</DialogTitle>
        </div>
        <DialogDescription className="pl-[52px]">
          <strong className="text-[rgb(var(--foreground))]">Seluruh isi Google Drive</strong> akun{" "}
          <strong className="text-[rgb(var(--foreground))]">{sourceEmail}</strong>{" "}
          ({formatBytes(sourceAccount?.usedBytes ?? 0)}) akan dipindahkan ke akun tujuan —
          termasuk <strong className="text-[rgb(var(--foreground))]">{sourceAccount?.fileCount ?? 0} file</strong>{" "}
          yang tercatat di dashboard dan file lain di drive — lalu dihapus dari drive sumber.
          Selama proses, file public disembunyikan sementara dari page download dan otomatis
          public kembali begitu selesai pindah.
        </DialogDescription>
      </DialogHeader>

      {/* Pilih akun tujuan */}
      <div className="mx-4 mb-2 flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[rgb(var(--ink-500))] dark:text-[rgb(var(--ink-500))]">
          Pindahkan ke akun
        </label>
        <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto">
          {candidates.length === 0 && (
            <p className="text-xs text-[rgb(var(--ink-500))] border border-dashed border-[rgb(var(--border-subtle))] rounded-lg p-3 text-center">
              Tidak ada akun lain yang terhubung.
            </p>
          )}
          {candidates.map((account) => {
            const isOnline = account.status === "online";
            const hasSpace = account.availableStorageBytes >= neededBytes;
            const selectable = isOnline && hasSpace;
            const isSelected = targetId === account.id;
            const provIcon = account.provider === "google_drive" ? googleDriveSvg
              : account.provider === "dropbox" ? undefined
              : onedriveSvg;
            return (
              <button
                key={account.id}
                type="button"
                disabled={!selectable}
                onClick={() => setTargetId(account.id)}
                className={`flex items-center justify-between gap-2 rounded-lg border p-2.5 text-left transition-colors ${
                  isSelected
                    ? "border-brand-500 bg-brand-50 dark:bg-brand-950/30"
                    : "border-[rgb(var(--border-subtle))] hover:border-[rgb(var(--border-subtle))] dark:hover:border-[rgb(var(--border-subtle))]"
                } ${!selectable ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {account.provider === "dropbox"
                    ? <SiDropbox color="#0061FF" className="h-5 w-5 shrink-0" />
                    : <img src={provIcon} alt="" className="h-5 w-5 shrink-0" />
                  }
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-[rgb(var(--foreground))] truncate">
                      {maskEmail(account.email)}
                    </p>
                    <p className="text-[10px] text-[rgb(var(--ink-500))] mt-0.5">
                      {account.provider === "google_drive" ? "Google Drive" : account.provider === "dropbox" ? "Dropbox" : "OneDrive"} · Sisa ruang: {formatBytes(account.availableStorageBytes)}
                      {!isOnline && " • Offline"}
                      {isOnline && !hasSpace && " • Ruang tidak cukup"}
                    </p>
                  </div>
                </div>
                {isSelected && <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-500" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mx-4 mb-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-3">
        <p className="text-xs text-red-700 dark:text-red-400 font-medium">
          Setelah migrasi selesai, seluruh file akan dihapus permanen dari drive sumber.
          Proses berjalan di latar belakang — pantau di panel progress. Tindakan ini tidak
          bisa dibatalkan untuk file yang sudah terlanjur dipindahkan.
        </p>
      </div>

      <div className="mx-4 mb-2 flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[rgb(var(--ink-500))] dark:text-[rgb(var(--ink-500))]">
          Ketik <strong className="text-[rgb(var(--foreground))] select-all">{sourceEmail}</strong> untuk konfirmasi
        </label>
        <Input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={sourceEmail}
          className="font-mono text-sm"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <DialogFooter>
        <Button variant="outline" className="border-[rgb(var(--border-subtle))] dark:border-[rgb(var(--border-subtle))] dark:text-[rgb(var(--foreground))] dark:bg-[rgb(var(--surface-muted))] hover:bg-[rgb(var(--surface-muted))] dark:hover:bg-[rgb(var(--surface-muted))] shrink-0" onClick={handleClose} disabled={isPending}>
          Batal
        </Button>
        <Button variant="destructive" onClick={() => targetId !== null && onConfirm(targetId)} disabled={!matches || isPending}>
          {isPending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Memulai...</>
          ) : (
            <><ArrowLeftRight className="mr-2 h-4 w-4" />Mulai Migrasi</>
          )}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function ConfirmDeleteAccountDialog({
  open,
  onClose,
  onConfirm,
  accountEmail,
  fileCount,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  accountEmail: string;
  fileCount: number;
  isPending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogHeader>
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <Power className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <DialogTitle>Are you sure?</DialogTitle>
        </div>
        <DialogDescription className="pl-[52px]">
          Disconnect akun <strong className="text-[rgb(var(--foreground))]">{accountEmail}</strong>{" "}
          dari sistem?
        </DialogDescription>
      </DialogHeader>
      <div className="mx-4 mb-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3">
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {fileCount > 0
            ? `${fileCount} file yang tercatat tetap ada di list dashboard, tapi tidak bisa didownload sampai akun ini login ulang dengan Google. File di Google Drive tidak dihapus.`
            : "Akun ini tidak memiliki file yang tercatat dan akan dihapus dari daftar. File di Google Drive tidak dihapus."}
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" className="border-[rgb(var(--border-subtle))] dark:border-[rgb(var(--border-subtle))] dark:text-[rgb(var(--foreground))] dark:bg-[rgb(var(--surface-muted))] hover:bg-[rgb(var(--surface-muted))] dark:hover:bg-[rgb(var(--surface-muted))] shrink-0" onClick={onClose} disabled={isPending}>
          No
        </Button>
        <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
          {isPending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Disconnecting...</>
          ) : (
            <><Power className="mr-2 h-4 w-4" />Yes, Disconnect</>
          )}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function GoogleDrivePage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthStatus = params.get("oauth");
    if (!oauthStatus) return;

    if (oauthStatus === "success") {
      const email = params.get("email") ?? "";
      toast({ title: "Akun berhasil terhubung", description: email, variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["drive-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["storage-manager"] });
    } else {
      const reason = params.get("reason") ?? "Terjadi kesalahan saat menghubungkan akun.";
      toast({ title: "Gagal menambahkan akun", description: reason, variant: "error" });
    }

    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  // Storage data
  const { data: summary, isLoading: isSummaryLoading } = useStorageManagerSummary();
  const isStorageLoading = useMinLoading(isSummaryLoading, 600);
  const syncAll = useSyncAllAccounts();

  // Accounts data
  const { data: accountsData, isLoading: isAccountsQueryLoading } = useDriveAccounts();
  const googleDriveAccounts = useMemo(() => {
    return accountsData?.accounts.filter((acc) => acc.provider === "google_drive") || [];
  }, [accountsData]);

  const isAccountsLoading = useMinLoading(isAccountsQueryLoading, 600);
  const deleteAccount = useDeleteDriveAccount();
  const formatDrive = useFormatDriveAccount();
  const [formatTarget, setFormatTarget] = useState<{ id: number; email: string; fileCount: number } | null>(null);
  const { startMigration, isStarting: isMigrationStarting, activeJobs } = useMigrationGlobal();
  const [migrateSource, setMigrateSource] = useState<{ id: number; email: string; fileCount: number; usedBytes: number } | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{ id: number; email: string; fileCount: number } | null>(null);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteAccount.mutateAsync(deleteTarget.id);
      toast({ title: "Akun berhasil diputus", variant: "success" });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Gagal menghapus akun.";
      toast({ title: "Gagal", description: msg, variant: "error" });
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleMigrateConfirm = async (targetAccountId: number) => {
    if (!migrateSource) return;
    try {
      await startMigration(migrateSource.id, targetAccountId);
      toast({
        title: "Migrasi dimulai",
        description: "Proses berjalan di latar belakang. Pantau progressnya lewat icon Send di pojok kanan atas.",
        variant: "success",
      });
      setMigrateSource(null);
    } catch (error) {
      toast({
        title: "Gagal memulai migrasi",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    }
  };

  const handleFormatConfirm = async () => {
    if (!formatTarget) return;
    try {
      const result = await formatDrive.mutateAsync(formatTarget.id);
      toast({ title: `${result.deletedFiles} file berhasil dihapus dari ${formatTarget.email}`, variant: "success" });
    } catch (error) {
      toast({ title: "Gagal memformat drive", description: error instanceof Error ? error.message : undefined, variant: "error" });
    } finally {
      setFormatTarget(null);
    }
  };

  return (
    <PageTransition>
      <div className="flex h-full flex-col gap-6">
        {/* Header */}
        <PageHeader
          eyebrow="Storage"
          icon={(props) => <img src={googleDriveSvg} alt="" {...props} />}
          title="Google Drive"
          description="Kelola storage dan akun Google Drive yang terhubung."
          actions={
            <>
              <button
                onClick={() => syncAll.mutate()}
                disabled={syncAll.isPending || isStorageLoading}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-[rgb(var(--border-subtle))] dark:border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] hover:bg-[rgb(var(--surface-muted))] dark:hover:bg-[rgb(var(--surface-muted))] disabled:opacity-60 h-9 px-3 text-sm font-medium text-[rgb(var(--ink-500))] dark:text-[rgb(var(--foreground))] shadow-sm transition-all"
              >
                <RefreshCw className={`h-4 w-4 ${syncAll.isPending ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">{syncAll.isPending ? "Syncing..." : "Sync"}</span>
              </button>
              {/* Mobile: icon-only [+]. Desktop: [+ Add Google Drive] */}
              <button
                onClick={() => setDialogOpen(true)}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-500 text-white hover:bg-brand-600 shadow-sm shadow-brand-500/25 disabled:opacity-50 h-9 w-9 sm:w-auto sm:px-3 text-sm font-medium transition-all"
                aria-label="Add Account"
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Add Google Drive</span>
              </button>
            </>
          }
        />

        {/* ── Storage Summary Card ── */}
        <Card className="shrink-0 relative overflow-hidden border-0 bg-[rgb(var(--surface))] shadow-sm ring-1 ring-[rgb(var(--border-subtle))] dark:ring-white/5">
          <div className="pointer-events-none absolute -top-12 -right-12 h-48 w-48 rounded-full bg-[#4285F4]/15 blur-3xl dark:bg-[#4285F4]/5" />
          <div className="pointer-events-none absolute top-4 left-1/4 h-40 w-40 rounded-full bg-[#EA4335]/15 blur-3xl hidden sm:block dark:hidden" />
          <div className="pointer-events-none absolute -bottom-10 right-1/4 h-48 w-48 rounded-full bg-[#FBBC05]/15 blur-3xl hidden sm:block dark:hidden" />
          <div className="pointer-events-none absolute -bottom-8 -left-8 h-48 w-48 rounded-full bg-[#34A853]/15 blur-3xl dark:bg-[#34A853]/5" />

          <CardHeader className="pb-3 relative z-10">
            <CardTitle className="flex items-center gap-2 text-brand-700 dark:text-brand-300">
              <Database className="h-5 w-5" />
              Total Kapasitas Gabungan
            </CardTitle>
          </CardHeader>
          <CardContent className="relative z-10">
            {isStorageLoading || !summary ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-end justify-between">
                  <div className="flex flex-col">
                    <span className="text-3xl font-bold tracking-tight text-[rgb(var(--foreground))]">
                      {formatBytes(summary.usedStorageBytes)}
                    </span>
                    <span className="text-sm font-medium text-[rgb(var(--ink-500))]">
                      Terpakai dari {formatBytes(summary.totalStorageBytes)}
                    </span>
                  </div>
                  <span className="text-sm px-3 py-1 rounded-full font-semibold bg-[rgb(var(--surface-muted))] text-[rgb(var(--foreground))] dark:bg-[rgb(var(--surface-muted))] dark:text-[rgb(var(--foreground))] ring-1 ring-[rgb(var(--border-subtle))] dark:ring-[rgb(var(--border-subtle))]">
                    {summary.usedPercentage.toFixed(1)}% Terpakai
                  </span>
                </div>
                <Progress
                  value={summary.usedPercentage}
                  className="h-3 bg-[rgb(var(--surface-muted))] dark:bg-[rgb(var(--surface-muted))]"
                  indicatorClassName={summary.usedPercentage > 90 ? "bg-red-500" : "bg-brand-500"}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Account Cards (merged Google Accounts) ── */}
        <div className="flex-1 flex flex-col min-h-[300px]">
          <h2 className="mb-4 text-lg font-semibold text-[rgb(var(--foreground))]">Akun Google Drive</h2>

          <AnimatePresence mode="wait">
            {isAccountsLoading ? (
              <motion.div key="skeleton" variants={containerVariants} initial="hidden" animate="show" exit="hidden">
                <CardGridSkeleton count={4} />
              </motion.div>
            ) : googleDriveAccounts.length === 0 ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-[rgb(var(--border-subtle))] bg-white/50 py-16 dark:border-[rgb(var(--border-subtle))] dark:bg-[rgb(var(--surface))]/50">
                <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-[rgb(var(--surface-muted))] dark:bg-[rgb(var(--surface-muted))]">
                  <KeyRound className="h-7 w-7 text-[rgb(var(--ink-500))] opacity-50" />
                </div>
                <p className="mt-4 text-sm font-medium text-[rgb(var(--foreground))]">Belum ada akun Google Drive</p>
                <p className="mt-1 text-xs text-[rgb(var(--ink-500))]">Klik tombol "Tambah Akun" di kanan atas untuk mulai.</p>
              </motion.div>
            ) : (
              <motion.div key="list" variants={containerVariants} initial="hidden" animate="show">
                <TooltipProvider delayDuration={300}>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {googleDriveAccounts.map((account) => {
                      const usagePercent = account.totalStorageBytes > 0
                        ? (account.usedStorageBytes / account.totalStorageBytes) * 100
                        : 0;
                      const isDanger = usagePercent > 90;
                      const isSyncing = account.status === "syncing";
                      const syncTime = account.lastSyncedAt
                        ? new Date(account.lastSyncedAt).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                        : null;

                      return (
                        <motion.div key={account.id} variants={itemVariants}>
                          <Card className="flex flex-col overflow-hidden transition-all hover:shadow-md dark:hover:shadow-xl dark:hover:ring-1 dark:hover:ring-white/10">
                            <div className="flex items-start justify-between p-4 sm:p-5 pb-3">
                              <div className="flex min-w-0 flex-1 items-center gap-3">
                                <Avatar className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 ring-1 ring-[rgb(var(--border-subtle))] dark:ring-[rgb(var(--border-subtle))]">
                                  <AvatarImage src={`https://avatar.vercel.sh/${account.email}?size=80`} alt={account.email} />
                                  <AvatarFallback className="bg-brand-100 font-semibold text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
                                    {account.email.charAt(0).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex min-w-0 flex-col">
                                  <EmailCell email={account.email} />
                                  <span className="text-[11px] text-[rgb(var(--ink-500))]">
                                    Google Drive Storage
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="mt-auto flex flex-col gap-3 px-4 sm:px-5 pb-4 sm:pb-5">
                              {/* Status + Sync info row */}
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <Badge variant={account.status === "online" ? "success" : account.status === "error" ? "destructive" : "neutral"} className="px-2 py-0.5 text-[10px]">
                                    <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${account.status === "online" ? "bg-emerald-500" : account.status === "syncing" ? "bg-blue-500" : account.status === "error" ? "bg-red-500" : "bg-[rgb(var(--surface-muted))]"}`} />
                                    {account.status === "online" ? "Online" : account.status === "syncing" ? "Syncing" : account.status === "error" ? "Error" : "Offline"}
                                  </Badge>
                                  {isSyncing && <RefreshCw className="h-3 w-3 animate-spin text-blue-500" />}
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setMigrateSource({
                                      id: account.id,
                                      email: account.email,
                                      fileCount: (account as any).fileCount ?? 0,
                                      usedBytes: account.usedStorageBytes,
                                    })}
                                    disabled={activeJobs.some((job) => job.sourceAccountId === account.id || job.targetAccountId === account.id)}
                                    className="rounded-full p-1.5 text-[rgb(var(--ink-500))] transition-colors hover:bg-brand-50 hover:text-brand-500 disabled:opacity-40 dark:hover:bg-brand-950/50"
                                    title="Migrasi Isi Drive ke Akun Lain"
                                  >
                                    <ArrowLeftRight className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setFormatTarget({ id: account.id, email: account.email, fileCount: (account as any).fileCount ?? 0 })}
                                    className="rounded-full p-1.5 text-[rgb(var(--ink-500))] transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40 dark:hover:bg-red-950/50"
                                    title="Format Drive"
                                  >
                                    <HardDrive className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteTarget({ id: account.id, email: account.email, fileCount: (account as any).fileCount ?? 0 })}
                                    disabled={deleteAccount.isPending}
                                    className="rounded-full p-1.5 text-[rgb(var(--ink-500))] transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40 dark:hover:bg-red-950/50"
                                    title="Disconnect Akun"
                                  >
                                    <Power className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>

                              {/* Last synced */}
                              <div className="flex items-center gap-1.5 text-[11px] text-[rgb(var(--ink-500))]">
                                <RefreshCw className="h-3 w-3 shrink-0" />
                                <span className="truncate">
                                  {isSyncing ? "Sedang sinkronisasi..." : syncTime ? `Sync: ${syncTime}` : "Belum pernah sync"}
                                </span>
                              </div>

                              {/* Storage info / bar */}
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center justify-between text-xs font-medium text-[rgb(var(--ink-500))] dark:text-[rgb(var(--ink-500))]">
                                  <span>{formatBytes(account.usedStorageBytes)}</span>
                                  <span>{formatBytes(account.totalStorageBytes)}</span>
                                </div>
                                <Progress
                                  value={usagePercent}
                                  className="h-1.5 bg-[rgb(var(--surface-muted))] dark:bg-[rgb(var(--surface-muted))]"
                                  indicatorClassName={isDanger ? "bg-red-500" : "bg-brand-500"}
                                />
                              </div>
                            </div>
                          </Card>
                        </motion.div>
                      );
                    })}
                  </div>
                </TooltipProvider>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <ConfirmFormatDriveDialog
          open={!!formatTarget}
          onClose={() => setFormatTarget(null)}
          onConfirm={handleFormatConfirm}
          accountEmail={formatTarget?.email ?? ""}
          fileCount={formatTarget?.fileCount ?? 0}
          isPending={formatDrive.isPending}
        />
        <ConfirmMigrateDriveDialog
          open={!!migrateSource}
          onClose={() => setMigrateSource(null)}
          onConfirm={handleMigrateConfirm}
          sourceAccount={migrateSource}
          accounts={accountsData?.accounts ?? []}
          isPending={isMigrationStarting}
        />
        <ConfirmDeleteAccountDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirm}
          accountEmail={deleteTarget?.email ?? ""}
          fileCount={deleteTarget?.fileCount ?? 0}
          isPending={deleteAccount.isPending}
        />
        <AddAccountDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      </div>
    </PageTransition>
  );
}
