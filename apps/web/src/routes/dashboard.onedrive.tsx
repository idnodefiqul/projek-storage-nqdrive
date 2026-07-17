import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import {
  Eye, EyeOff, Database, RefreshCw, Plus, Loader2, AlertCircle,
  CheckCircle2, ShieldCheck, AlertTriangle, HardDrive, ArrowLeftRight, Power, KeyRound,
} from "lucide-react";
import {
  Card, Badge, Progress,
  TooltipProvider, Tooltip, TooltipTrigger, TooltipContent,
  Button, Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Input, useToast,
  Avatar, AvatarFallback,
} from "@nqdrive/ui";
import { formatBytes } from "@nqdrive/shared";
import {
  useStorageManagerSummary, useSyncAllAccounts,
  useDriveAccounts, useDeleteDriveAccount,
  useOneDriveOAuthUrl,
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
import { onedriveSvg, googleDriveSvg } from "../assets";
import { SiDropbox } from "@icons-pack/react-simple-icons";

const OD_BLUE = "#0078d4";

function maskAccountEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  return `${local.slice(0, 3)}***@${domain}`;
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] } },
};

export const Route = createFileRoute("/dashboard/onedrive")({
  component: OneDrivePage,
});

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  return `${local.slice(0, 3)}***@${domain}`;
}

function EmailCell({ email }: { email: string }) {
  const [shown, setShown] = useState(false);
  const displayEmail = shown ? email : maskEmail(email);
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="truncate text-sm font-medium text-[rgb(var(--foreground))]">{displayEmail}</span>
          </TooltipTrigger>
          <TooltipContent side="top"><p>{email}</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <button type="button" onClick={() => setShown((v) => !v)}
        className="shrink-0 text-zinc-400 transition-colors hover:text-brand-500"
        title={shown ? "Sembunyikan email" : "Tampilkan email"}>
        {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function AddAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [formError, setFormError] = useState<string | null>(null);
  const oauthUrlMutation = useOneDriveOAuthUrl();

  const handleClose = () => {
    setFormError(null);
    oauthUrlMutation.reset();
    onClose();
  };

  const handleLogin = async () => {
    setFormError(null);
    try {
      const { url } = await oauthUrlMutation.mutateAsync();
      window.location.href = url;
    } catch (error) {
      let msg = "Gagal memulai login OneDrive. Coba lagi.";
      if (error instanceof ApiClientError || error instanceof Error) msg = error.message;
      setFormError(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()} className="max-w-xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <img src={onedriveSvg} alt="" className="h-5 w-5" />
          Tambah Akun OneDrive
        </DialogTitle>
        <DialogDescription>Hubungkan akun Microsoft OneDrive ke storage pool.</DialogDescription>
      </DialogHeader>

      <div className="rounded-xl border-2 border-brand-500/40 bg-brand-50/50 p-4 dark:border-brand-500/30 dark:bg-brand-950/20">
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-white">
            <ShieldCheck className="h-3 w-3" /> Direkomendasikan
          </span>
          <span className="text-xs text-[rgb(var(--ink-500))]">Login sekali, token diperbarui otomatis</span>
        </div>

        <button
          onClick={handleLogin}
          disabled={oauthUrlMutation.isPending}
          className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-zinc-300 bg-white
            text-sm font-medium text-zinc-700 shadow-sm transition-all hover:bg-zinc-50 hover:shadow
            disabled:cursor-not-allowed disabled:opacity-60
            dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
        >
          {oauthUrlMutation.isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Mengalihkan ke Microsoft...</>
          ) : (
            <>
              <img src={onedriveSvg} alt="" className="h-5 w-5" />
              Login dengan OneDrive
            </>
          )}
        </button>

        <p className="mt-2.5 text-[11px] leading-relaxed text-[rgb(var(--ink-500))]">
          Kamu akan diarahkan ke halaman izin Microsoft. Setelah menekan <strong>Accept</strong>,
          akun otomatis terhubung — tanpa perlu menyalin token.
        </p>
      </div>

      {formError && (
        <div className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-800 dark:bg-orange-950">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
          <p className="text-sm text-orange-700 dark:text-orange-300">{formError}</p>
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
        <Button variant="outline" onClick={handleClose} disabled={oauthUrlMutation.isPending} className="border-zinc-300 dark:border-zinc-600 dark:text-zinc-100 dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700">Tutup</Button>
      </div>
    </Dialog>
  );
}

function ConfirmFormatDriveDialog({
  open, onClose, onConfirm, accountEmail, fileCount, isPending,
}: {
  open: boolean; onClose: () => void; onConfirm: () => void;
  accountEmail: string; fileCount: number; isPending: boolean;
}) {
  const [confirmText, setConfirmText] = useState("");
  const matches = confirmText === accountEmail;
  const handleClose = () => { setConfirmText(""); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()} className="max-w-md">
      <DialogHeader>
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <DialogTitle>Format OneDrive?</DialogTitle>
        </div>
        <DialogDescription className="pl-[52px]">
          <strong className="text-[rgb(var(--foreground))]">Seluruh isi OneDrive</strong> akun{" "}
          <strong className="text-[rgb(var(--foreground))]">{accountEmail}</strong>{" "}
          akan dihapus permanen — termasuk{" "}
          <strong className="text-[rgb(var(--foreground))]">{fileCount} file</strong> yang tercatat
          di dashboard. Akun tetap terhubung.
        </DialogDescription>
      </DialogHeader>
      <div className="mx-4 mb-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-3">
        <p className="text-xs text-red-700 dark:text-red-400 font-medium">
          Tindakan ini tidak bisa dibatalkan. Seluruh file akan hilang selamanya dari OneDrive.
        </p>
      </div>
      <div className="mx-4 mb-2 flex flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Ketik <strong className="text-[rgb(var(--foreground))] select-all">{accountEmail}</strong> untuk konfirmasi
        </label>
        <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={accountEmail}
          className="font-mono text-sm" autoComplete="off" spellCheck={false} />
      </div>
      <DialogFooter>
        <Button variant="outline" className="border-zinc-300 dark:border-zinc-600 dark:text-zinc-100 dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 shrink-0" onClick={handleClose} disabled={isPending}>Batal</Button>
        <Button variant="destructive" onClick={onConfirm} disabled={!matches || isPending}>
          {isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Memformat...</> : <><HardDrive className="mr-2 h-4 w-4" />Format OneDrive</>}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

const MIGRATION_RESERVE_BYTES = 1 * 1024 * 1024 * 1024;

function ConfirmMigrateDriveDialog({
  open, onClose, onConfirm, sourceAccount, accounts, isPending,
}: {
  open: boolean; onClose: () => void; onConfirm: (targetAccountId: number) => void;
  sourceAccount: { id: number; email: string; fileCount: number; usedBytes: number } | null;
  accounts: DriveAccountWithFileCount[]; isPending: boolean;
}) {
  const [targetId, setTargetId] = useState<number | null>(null);
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    if (open) { setTargetId(null); setConfirmText(""); }
  }, [open]);

  const sourceEmail = sourceAccount?.email ?? "";
  const matches = confirmText === sourceEmail && targetId !== null;
  const neededBytes = (sourceAccount?.usedBytes ?? 0) + MIGRATION_RESERVE_BYTES;
  const candidates = accounts.filter((account) => account.id !== sourceAccount?.id);

  const handleClose = () => { setTargetId(null); setConfirmText(""); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogHeader>
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <ArrowLeftRight className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <DialogTitle>Migrasi Isi Storage?</DialogTitle>
        </div>
        <DialogDescription className="pl-[52px]">
          <strong className="text-[rgb(var(--foreground))]">Seluruh isi</strong> akun{" "}
          <strong className="text-[rgb(var(--foreground))]">{sourceEmail}</strong>{" "}
          ({formatBytes(sourceAccount?.usedBytes ?? 0)}) akan dipindahkan ke akun tujuan —
          termasuk <strong className="text-[rgb(var(--foreground))]">{sourceAccount?.fileCount ?? 0} file</strong>{" "}
          — lalu dihapus dari sumber. File tujuan boleh beda provider.
        </DialogDescription>
      </DialogHeader>

      <div className="mx-4 mb-2 flex flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Pindahkan ke akun</label>
        <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto">
          {candidates.length === 0 && (
            <p className="text-xs text-zinc-400 border border-dashed border-[rgb(var(--border-subtle))] rounded-lg p-3 text-center">
              Tidak ada akun lain yang terhubung.
            </p>
          )}
          {candidates.map((account) => {
            const isOnline = account.status === "online";
            const hasSpace = account.availableStorageBytes >= neededBytes;
            const selectable = isOnline && hasSpace;
            const isSelected = targetId === account.id;
            const provIcon = account.provider === "onedrive" ? onedriveSvg
              : account.provider === "dropbox" ? undefined
              : googleDriveSvg;
            return (
              <button key={account.id} type="button" disabled={!selectable}
                onClick={() => setTargetId(account.id)}
                className={`flex items-center justify-between gap-2 rounded-lg border p-2.5 text-left transition-colors ${
                  isSelected ? "border-brand-500 bg-brand-50 dark:bg-brand-950/30"
                    : "border-[rgb(var(--border-subtle))] hover:border-zinc-300 dark:hover:border-zinc-700"
                } ${!selectable ? "opacity-50 cursor-not-allowed" : ""}`}>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {account.provider === "dropbox"
                    ? <SiDropbox color="#0061FF" className="h-5 w-5 shrink-0" />
                    : <img src={provIcon} alt="" className="h-5 w-5 shrink-0" />
                  }
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-[rgb(var(--foreground))] truncate">{maskAccountEmail(account.email)}</p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">
                      {account.provider === "onedrive" ? "OneDrive" : account.provider === "dropbox" ? "Dropbox" : "Google Drive"} · Sisa {formatBytes(account.availableStorageBytes)}
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

      <div className="mx-4 mb-2 flex flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Ketik <strong className="text-[rgb(var(--foreground))] select-all">{sourceEmail}</strong> untuk konfirmasi
        </label>
        <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={sourceEmail}
          className="font-mono text-sm" autoComplete="off" spellCheck={false} />
      </div>

      <DialogFooter>
        <Button variant="outline" className="border-zinc-300 dark:border-zinc-600 dark:text-zinc-100 dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 shrink-0" onClick={handleClose} disabled={isPending}>Batal</Button>
        <Button variant="destructive" onClick={() => targetId !== null && onConfirm(targetId)} disabled={!matches || isPending}>
          {isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Memulai...</> : <><ArrowLeftRight className="mr-2 h-4 w-4" />Mulai Migrasi</>}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function ConfirmDeleteAccountDialog({
  open, onClose, onConfirm, accountEmail, fileCount, isPending,
}: {
  open: boolean; onClose: () => void; onConfirm: () => void;
  accountEmail: string; fileCount: number; isPending: boolean;
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
          Disconnect akun <strong className="text-[rgb(var(--foreground))]">{accountEmail}</strong> dari sistem?
        </DialogDescription>
      </DialogHeader>
      <div className="mx-4 mb-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3">
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {fileCount > 0
            ? `${fileCount} file yang tercatat tetap ada di list dashboard, tapi tidak bisa didownload sampai akun ini login ulang dengan OneDrive. File di OneDrive tidak dihapus.`
            : "Akun ini tidak memiliki file yang tercatat dan akan dihapus dari daftar. File di OneDrive tidak dihapus."}
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" className="border-zinc-300 dark:border-zinc-600 dark:text-zinc-100 dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 shrink-0" onClick={onClose} disabled={isPending}>No</Button>
        <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
          {isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Disconnecting...</> : <><Power className="mr-2 h-4 w-4" />Yes, Disconnect</>}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function OneDrivePage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthStatus = params.get("oauth");
    if (!oauthStatus) return;

    if (oauthStatus === "success") {
      const email = params.get("email") ?? "";
      toast({ title: "Akun OneDrive berhasil terhubung", description: email, variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["drive-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["storage-manager"] });
    } else {
      const reason = params.get("reason") ?? "Terjadi kesalahan saat menghubungkan akun.";
      toast({ title: "Gagal menambahkan akun OneDrive", description: reason, variant: "error" });
    }
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const { isLoading: isSummaryLoading } = useStorageManagerSummary();
  const isStorageLoading = useMinLoading(isSummaryLoading, 600);
  const syncAll = useSyncAllAccounts();

  const { data: accountsData, isLoading: isAccountsQueryLoading } = useDriveAccounts();
  const oneDriveAccounts = useMemo(
    () => accountsData?.accounts.filter((acc) => acc.provider === "onedrive") || [],
    [accountsData]
  );

  const isAccountsLoading = useMinLoading(isAccountsQueryLoading, 600);
  const deleteAccount = useDeleteDriveAccount();
  const formatDrive = useFormatDriveAccount();
  const [formatTarget, setFormatTarget] = useState<{ id: number; email: string; fileCount: number } | null>(null);
  const { startMigration, isStarting: isMigrationStarting, activeJobs } = useMigrationGlobal();
  const [migrateSource, setMigrateSource] = useState<{ id: number; email: string; fileCount: number; usedBytes: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; email: string; fileCount: number } | null>(null);

  const combined = useMemo(() => {
    const total = oneDriveAccounts.reduce((s, a) => s + a.totalStorageBytes, 0);
    const used = oneDriveAccounts.reduce((s, a) => s + a.usedStorageBytes, 0);
    return { total, used, pct: total > 0 ? (used / total) * 100 : 0 };
  }, [oneDriveAccounts]);

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
      toast({ title: "Migrasi dimulai", description: "Proses berjalan di latar belakang.", variant: "success" });
      setMigrateSource(null);
    } catch (error) {
      toast({ title: "Gagal memulai migrasi", description: error instanceof Error ? error.message : undefined, variant: "error" });
    }
  };

  const handleFormatConfirm = async () => {
    if (!formatTarget) return;
    try {
      const result = await formatDrive.mutateAsync(formatTarget.id);
      toast({ title: `${result.deletedFiles} file berhasil dihapus dari ${formatTarget.email}`, variant: "success" });
    } catch (error) {
      toast({ title: "Gagal memformat OneDrive", description: error instanceof Error ? error.message : undefined, variant: "error" });
    } finally {
      setFormatTarget(null);
    }
  };

  return (
    <PageTransition>
      <div className="flex h-full flex-col gap-6">
        <PageHeader
          eyebrow="Storage"
          icon={(props) => <img src={onedriveSvg} alt="" {...props} />}
          title="OneDrive"
          description="Kelola storage dan akun OneDrive yang terhubung."
          actions={
            <>
              <button
                onClick={() => syncAll.mutate()}
                disabled={syncAll.isPending || isStorageLoading}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-[rgb(var(--surface))] hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-60 h-9 px-3 text-sm font-medium text-zinc-700 dark:text-zinc-300 shadow-sm transition-all"
              >
                <RefreshCw className={`h-4 w-4 ${syncAll.isPending ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">{syncAll.isPending ? "Syncing..." : "Sync"}</span>
              </button>
              <button
                onClick={() => setDialogOpen(true)}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-500 text-white hover:bg-brand-600 shadow-sm shadow-brand-500/25 disabled:opacity-50 h-9 w-9 sm:w-auto sm:px-3 text-sm font-medium transition-all"
                aria-label="Add OneDrive"
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Add OneDrive</span>
              </button>
            </>
          }
        />

        {/* Total OneDrive capacity */}
        <Card className="shrink-0 relative overflow-hidden border-0 bg-[rgb(var(--surface))] shadow-sm ring-1 ring-zinc-200 dark:ring-white/5">
          <div className="pointer-events-none absolute -top-12 -right-12 h-48 w-48 rounded-full bg-[#0078d4]/15 blur-3xl dark:bg-[#0078d4]/5" />
          <div className="relative z-10 p-5">
            <div className="mb-3 flex items-center gap-2 font-semibold text-brand-700 dark:text-brand-300">
              <Database className="h-5 w-5" />
              Total Kapasitas OneDrive
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-end justify-between">
                <div className="flex flex-col">
                  <span className="text-3xl font-bold tracking-tight text-[rgb(var(--foreground))]">
                    {formatBytes(combined.used)}
                  </span>
                  <span className="text-sm font-medium text-[rgb(var(--ink-500))]">
                    Terpakai dari {formatBytes(combined.total)}
                  </span>
                </div>
                <span className="text-sm px-3 py-1 rounded-full font-semibold bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 ring-1 ring-zinc-200 dark:ring-zinc-700">
                  {combined.pct.toFixed(1)}% Terpakai
                </span>
              </div>
              <Progress
                value={combined.pct}
                className="h-3 bg-zinc-200 dark:bg-zinc-800"
                indicatorClassName={combined.pct > 90 ? "bg-red-500" : "bg-brand-500"}
              />
            </div>
          </div>
        </Card>

        {/* Account Cards */}
        <div className="flex-1 flex flex-col min-h-[300px]">
          <h2 className="mb-4 text-lg font-semibold text-[rgb(var(--foreground))]">Akun OneDrive ({oneDriveAccounts.length})</h2>

          <AnimatePresence mode="wait">
            {isAccountsLoading ? (
              <motion.div key="skeleton" variants={containerVariants} initial="hidden" animate="show" exit="hidden">
                <CardGridSkeleton count={4} />
              </motion.div>
            ) : oneDriveAccounts.length === 0 ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-white/50 py-16 dark:border-zinc-800 dark:bg-zinc-900/50">
                <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-[#0078d4]/10">
                  <img src={onedriveSvg} alt="OneDrive" className="h-7 w-7 opacity-70" />
                </div>
                <p className="mt-4 text-sm font-medium text-[rgb(var(--foreground))]">Belum ada akun OneDrive</p>
                <p className="mt-1 text-xs text-[rgb(var(--ink-500))]">Klik tombol "Add OneDrive" di kanan atas untuk mulai.</p>
              </motion.div>
            ) : (
              <motion.div key="list" variants={containerVariants} initial="hidden" animate="show">
                <TooltipProvider delayDuration={300}>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {oneDriveAccounts.map((account) => {
                      const usagePercent = account.totalStorageBytes > 0
                        ? (account.usedStorageBytes / account.totalStorageBytes) * 100 : 0;
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
                                <Avatar className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 ring-1 ring-zinc-200 dark:ring-zinc-800">
                                  <AvatarFallback className="bg-[#0078d4]/10 font-semibold text-[#0078d4] dark:bg-[#0078d4]/20">
                                    {account.email.charAt(0).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex min-w-0 flex-col">
                                  <EmailCell email={account.email} />
                                  <span className="text-[11px] text-zinc-500">OneDrive Storage</span>
                                </div>
                              </div>
                            </div>

                            <div className="mt-auto flex flex-col gap-3 px-4 sm:px-5 pb-4 sm:pb-5">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <Badge variant={account.status === "online" ? "success" : account.status === "error" ? "destructive" : "neutral"} className="px-2 py-0.5 text-[10px]">
                                    <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${account.status === "online" ? "bg-emerald-500" : account.status === "syncing" ? "bg-blue-500" : account.status === "error" ? "bg-red-500" : "bg-zinc-400"}`} />
                                    {account.status === "online" ? "Online" : account.status === "syncing" ? "Syncing" : account.status === "error" ? "Error" : "Offline"}
                                  </Badge>
                                  {isSyncing && <RefreshCw className="h-3 w-3 animate-spin text-blue-500" />}
                                </div>
                                <div className="flex items-center gap-1">
                                  <button type="button"
                                    onClick={() => setMigrateSource({ id: account.id, email: account.email, fileCount: (account as any).fileCount ?? 0, usedBytes: account.usedStorageBytes })}
                                    disabled={activeJobs.some((job) => job.sourceAccountId === account.id || job.targetAccountId === account.id)}
                                    className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-brand-50 hover:text-brand-500 disabled:opacity-40 dark:hover:bg-brand-950/50"
                                    title="Migrasi Isi Storage ke Akun Lain">
                                    <ArrowLeftRight className="h-4 w-4" />
                                  </button>
                                  <button type="button"
                                    onClick={() => setFormatTarget({ id: account.id, email: account.email, fileCount: (account as any).fileCount ?? 0 })}
                                    className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40 dark:hover:bg-red-950/50"
                                    title="Format Storage">
                                    <HardDrive className="h-4 w-4" />
                                  </button>
                                  <button type="button"
                                    onClick={() => setDeleteTarget({ id: account.id, email: account.email, fileCount: (account as any).fileCount ?? 0 })}
                                    disabled={deleteAccount.isPending}
                                    className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40 dark:hover:bg-red-950/50"
                                    title="Disconnect Akun">
                                    <Power className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 text-[11px] text-[rgb(var(--ink-500))]">
                                <RefreshCw className="h-3 w-3 shrink-0" />
                                <span className="truncate">
                                  {isSyncing ? "Sedang sinkronisasi..." : syncTime ? `Sync: ${syncTime}` : "Belum pernah sync"}
                                </span>
                              </div>

                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                  <span>{formatBytes(account.usedStorageBytes)}</span>
                                  <span>{formatBytes(account.totalStorageBytes)}</span>
                                </div>
                                <Progress value={usagePercent}
                                  className="h-1.5 bg-zinc-200 dark:bg-zinc-800"
                                  indicatorClassName={isDanger ? "bg-red-500" : "bg-brand-500"} />
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
          open={!!formatTarget} onClose={() => setFormatTarget(null)} onConfirm={handleFormatConfirm}
          accountEmail={formatTarget?.email ?? ""} fileCount={formatTarget?.fileCount ?? 0} isPending={formatDrive.isPending} />
        <ConfirmMigrateDriveDialog
          open={!!migrateSource} onClose={() => setMigrateSource(null)} onConfirm={handleMigrateConfirm}
          sourceAccount={migrateSource} accounts={accountsData?.accounts ?? []} isPending={isMigrationStarting} />
        <ConfirmDeleteAccountDialog
          open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDeleteConfirm}
          accountEmail={deleteTarget?.email ?? ""} fileCount={deleteTarget?.fileCount ?? 0} isPending={deleteAccount.isPending} />
        <AddAccountDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      </div>
    </PageTransition>
  );
}
