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
  useConnectTelegramAccount,
  useFormatDriveAccount,
  useScanTelegramChats,
} from "../hooks/use-drive-accounts";
import { useMinLoading } from "../hooks/use-min-loading";
import { useMigrationGlobal } from "../stores/migration-provider";
import type { DriveAccountWithFileCount } from "../services/drive-account.service";
import { PageTransition } from "../components/page-transition";
import { CardGridSkeleton } from "../components/skeletons";
import { ApiClientError } from "../lib/client";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { telegramSvg } from "../assets";

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

export const Route = createFileRoute("/dashboard/telegram-storage")({
  component: TelegramStoragePage,
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function maskToken(token: string): string {
  if (token.length <= 15) return token;
  const parts = token.split(":");
  if (parts.length > 1) {
    return `${parts[0]}:***`;
  }
  return `${token.slice(0, 5)}***${token.slice(-5)}`;
}

function EmailCell({ email, size = "sm" }: { email: string; size?: "sm" | "xs" }) {
  const [shown, setShown] = useState(false);
  const displayEmail = shown ? email : maskToken(email);

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`truncate font-medium text-zinc-900 dark:text-zinc-100 ${size === "xs" ? "text-xs" : "text-sm"}`}>
              {displayEmail}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{email}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <button type="button" onClick={() => setShown((v) => !v)}
        className="shrink-0 text-zinc-400 transition-colors hover:text-brand-500"
        title={shown ? "Sembunyikan kredensial" : "Tampilkan kredensial"}>
        {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// ─── ADD TELEGRAM STORAGE DIALOG ─────────────────────────────────────────────

function AddTelegramAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [scannedChats, setScannedChats] = useState<Array<{ id: number; title: string; type: string }>>([]);

  const connectMutation = useConnectTelegramAccount();
  const scanMutation = useScanTelegramChats();

  const handleClose = () => {
    setBotToken("");
    setChatId("");
    setEmail("");
    setFormError(null);
    setScannedChats([]);
    connectMutation.reset();
    scanMutation.reset();
    onClose();
  };

  const handleScan = async () => {
    setFormError(null);
    const token = botToken.trim();
    if (!token) {
      setFormError("Masukkan Bot Token terlebih dahulu sebelum men-scan.");
      return;
    }

    try {
      const res = await scanMutation.mutateAsync(token);
      if (res.chats && res.chats.length > 0 && res.chats[0]) {
        setScannedChats(res.chats);
        // Auto select first chat
        setChatId(String(res.chats[0].id));
        toast({ title: "Scan Berhasil", description: `Menemukan ${res.chats.length} channel.`, variant: "success" });
      } else if (res.note) {
        setScannedChats([]);
        setFormError(res.note);
      } else {
        setScannedChats([]);
        setFormError("Tidak ada channel terdeteksi. Pastikan bot sudah jadi admin channel privat & kirim 1 pesan.");
      }
    } catch (err: any) {
      setFormError(err.message || "Gagal men-scan channel.");
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const token = botToken.trim();
    const chat = chatId.trim();
    const identifier = email.trim() || "Telegram Bot";

    if (!token || !chat) {
      setFormError("Bot Token dan Chat ID wajib diisi.");
      return;
    }

    try {
      const result = await connectMutation.mutateAsync({
        botToken: token,
        chatId: chat,
        email: identifier,
      });
      toast({ title: "Telegram storage berhasil ditambahkan", description: result.account.email, variant: "success" });
      handleClose();
    } catch (error) {
      let msg = "Terjadi kesalahan. Coba lagi.";
      if (error instanceof ApiClientError || error instanceof Error) msg = error.message;
      toast({ title: "Gagal menambahkan Telegram storage", description: msg, variant: "error" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()} className="max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Tambah Telegram Storage
        </DialogTitle>
        <DialogDescription>Hubungkan Bot Telegram dan Chat ID sebagai storage pool.</DialogDescription>
      </DialogHeader>

      <form onSubmit={handleConnect} className="space-y-4 pt-3">
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Bot Token Telegram</label>
            <button
              type="button"
              onClick={handleScan}
              disabled={scanMutation.isPending}
              className="text-xs text-sky-500 hover:text-sky-600 font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              {scanMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Scan Channel/Chat ID
            </button>
          </div>
          <Input
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder="50392039:AAFd930..."
            className="font-mono text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Chat ID / Channel ID</label>
          {scannedChats.length > 0 ? (
            <select
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              className="w-full h-10 rounded-lg border border-zinc-200 bg-white dark:bg-zinc-950 px-3 text-sm text-zinc-700 dark:text-zinc-300 outline-none focus:border-brand-500"
            >
              {scannedChats.map((c) => (
                <option key={c.id} value={c.id}>
                  [{c.type.toUpperCase()}] {c.title} ({c.id})
                </option>
              ))}
            </select>
          ) : (
            <Input
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="-10030948293 atau Chat ID pribadi"
              className="font-mono text-sm"
            />
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Nama Identitas Akun (Opsional)</label>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Akan otomatis terdeteksi jika dikosongkan"
          />
        </div>

        {formError && (
          <div className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-800 dark:bg-orange-950">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
            <p className="text-xs text-orange-700 dark:text-orange-300">{formError}</p>
          </div>
        )}

        <DialogFooter className="pt-2">
          <Button type="button" variant="ghost" onClick={handleClose}>
            Batal
          </Button>
          <Button type="submit" disabled={connectMutation.isPending} className="bg-sky-600 hover:bg-sky-700 text-white">
            {connectMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Menghubungkan...</>
            ) : (
              "Hubungkan"
            )}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

// ─── DIALOG KONFIRMASI DELETE ─────────────────────────────────────────────────

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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} className="max-w-md">
      <DialogHeader>
        <DialogTitle className="text-red-500">Putuskan Telegram Storage?</DialogTitle>
        <DialogDescription>Tindakan ini akan menghentikan integrasi bot Telegram ini.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3 py-3 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          Akun: <strong className="font-semibold text-zinc-950 dark:text-zinc-50">{accountEmail}</strong>
        </p>
        <p>
          Jumlah file aktif: <strong>{fileCount} file</strong>.
        </p>
        {fileCount > 0 ? (
          <p className="rounded-lg bg-yellow-50 p-3 text-xs leading-relaxed text-yellow-800 border border-yellow-200 dark:bg-yellow-950/20 dark:text-yellow-400 dark:border-yellow-900/30">
            ⚠️ <strong>Catatan:</strong> Bot akan diputus dari pool storage. <strong>{fileCount} file</strong> di dashboard tetap ada — tidak dihapus. Download akan error sampai bot dihubungkan kembali. File di Telegram channel juga tetap aman.
          </p>
        ) : (
          <p className="text-xs text-zinc-500 leading-relaxed">
            Karena tidak ada file terkait, akun akan dihapus bersih secara permanen dari sistem.
          </p>
        )}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={isPending}>
          Batal
        </Button>
        <Button onClick={onConfirm} disabled={isPending} className="bg-red-500 hover:bg-red-600 text-white">
          {isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Memutus...</> : "Putuskan Koneksi"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// ─── DIALOG KONFIRMASI FORMAT ─────────────────────────────────────────────────

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
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} className="max-w-md">
      <DialogHeader>
        <DialogTitle className="text-red-500 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          Format Telegram Storage?
        </DialogTitle>
        <DialogDescription>Tindakan ini berbahaya dan TIDAK BISA dibatalkan.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3 py-3 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
        <p>
          Anda akan menghapus semua file di Telegram channel/chat: <strong className="font-semibold text-zinc-900 dark:text-white">{accountEmail}</strong>.
        </p>
        <p className="font-medium text-red-600 dark:text-red-400">
          Total {fileCount} file yang tercatat di dashboard akan terhapus secara permanen dari database, dan bot akan mencoba menghapus pesan dokumen terkait di Telegram.
        </p>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={isPending}>
          Batal
        </Button>
        <Button onClick={onConfirm} disabled={isPending} className="bg-red-500 hover:bg-red-600 text-white">
          {isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Memformat...</> : "Mulai Format"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// ─── DIALOG KONFIRMASI MIGRASI ────────────────────────────────────────────────

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
  const [targetId, setTargetId] = useState<string>("");
  const eligibleTargets = accounts.filter((a) => a.id !== sourceAccount?.id && a.status === "online");

  useEffect(() => {
    if (eligibleTargets[0]) setTargetId(String(eligibleTargets[0].id));
  }, [sourceAccount, accounts]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} className="max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ArrowLeftRight className="h-5 w-5 text-brand-500" />
          Migrasikan File
        </DialogTitle>
        <DialogDescription>Pindahkan database/record file ke akun storage lain.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
        <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900/50 p-3 space-y-1.5">
          <p>Asal: <span className="font-semibold text-zinc-900 dark:text-white">{sourceAccount?.email}</span></p>
          <p>Total size: <span className="font-medium text-zinc-800 dark:text-zinc-200">{formatBytes(sourceAccount?.usedBytes ?? 0)}</span></p>
          <p>File terdata: <span className="font-medium text-zinc-800 dark:text-zinc-200">{sourceAccount?.fileCount} file</span></p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-500">Pilih Storage Tujuan</label>
          {eligibleTargets.length === 0 ? (
            <p className="text-xs text-orange-600 dark:text-orange-400 font-medium bg-orange-50/50 dark:bg-orange-950/20 p-3 rounded-lg">
              Tidak ada akun storage online lain yang tersedia sebagai tujuan migrasi.
            </p>
          ) : (
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm text-zinc-700 dark:text-zinc-300 outline-none focus:border-brand-500"
            >
              {eligibleTargets.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.email} ({formatBytes(acc.availableStorageBytes)} free)
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={isPending}>
          Batal
        </Button>
        <Button
          onClick={() => onConfirm(Number(targetId))}
          disabled={isPending || !targetId}
          className="bg-brand-500 hover:bg-brand-600 text-white"
        >
          {isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Memproses...</> : "Mulai Migrasi"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

function TelegramStoragePage() {
  const { toast } = useToast();
  const [telegramDialogOpen, setTelegramDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: summary, isLoading: isSummaryLoading } = useStorageManagerSummary();
  const isStorageLoading = useMinLoading(isSummaryLoading, 600);
  const syncAll = useSyncAllAccounts();

  // Accounts data
  const { data: accountsData, isLoading: isAccountsQueryLoading } = useDriveAccounts();
  const telegramAccounts = useMemo(() => {
    return accountsData?.accounts.filter((acc) => acc.provider === "telegram") || [];
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
      toast({ title: "Telegram storage berhasil diputus", variant: "success" });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Gagal menghapus Telegram storage.";
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
      let msg = "Gagal memulai migrasi.";
      if (error instanceof ApiClientError || error instanceof Error) msg = error.message;
      toast({ title: "Gagal", description: msg, variant: "error" });
    }
  };

  const handleFormatConfirm = async () => {
    if (!formatTarget) return;
    try {
      const res = await formatDrive.mutateAsync(formatTarget.id);
      toast({ title: "Format Berhasil", description: `${res.deletedFiles} file dihapus.`, variant: "success" });
    } catch (error) {
      let msg = "Gagal memformat drive.";
      if (error instanceof ApiClientError || error instanceof Error) msg = error.message;
      toast({ title: "Format Gagal", description: msg, variant: "error" });
    } finally {
      setFormatTarget(null);
    }
  };

  return (
    <PageTransition>
      <div className="flex h-full flex-col gap-6 p-4 sm:p-6 overflow-y-auto no-scrollbar pb-24">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-300 shadow-sm ring-1 ring-zinc-200 dark:ring-white/5">
              <img src={telegramSvg} alt="Telegram" className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Telegram Storage</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Kelola virtual storage yang terhubung menggunakan Telegram Bot.
              </p>
            </div>
          </div>
          {/* Sync + Add buttons side by side */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => syncAll.mutate()}
              disabled={syncAll.isPending || isStorageLoading}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-60 h-9 px-3 text-sm font-medium text-zinc-700 dark:text-zinc-300 shadow-sm transition-all"
            >
              <RefreshCw className={`h-4 w-4 ${syncAll.isPending ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{syncAll.isPending ? "Syncing..." : "Sync"}</span>
            </button>
            <button
              onClick={() => setTelegramDialogOpen(true)}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-sky-500 text-white hover:bg-sky-600 shadow-sm shadow-sky-500/25 disabled:opacity-50 h-9 w-9 sm:w-auto sm:px-3 text-sm font-medium transition-all"
              aria-label="Add Telegram"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Add Telegram</span>
            </button>
          </div>
        </div>

        {/* ── Storage Accounts List ── */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between shrink-0">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Akun Terhubung ({telegramAccounts.length})
            </h2>
          </div>

          <AnimatePresence mode="wait">
            {isAccountsLoading ? (
              <motion.div key="skeleton" variants={containerVariants} initial="hidden" animate="show" exit="hidden">
                <CardGridSkeleton count={4} />
              </motion.div>
            ) : telegramAccounts.length === 0 ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-white/50 py-16 dark:border-zinc-800 dark:bg-zinc-900/50">
                <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/30">
                  <img src={telegramSvg} alt="Telegram" className="h-7 w-7 opacity-60" />
                </div>
                <p className="mt-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">Belum ada Telegram Storage</p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Klik tombol "Add Telegram" di kanan atas untuk mulai.</p>
              </motion.div>
            ) : (
              <motion.div key="list" variants={containerVariants} initial="hidden" animate="show">
                <TooltipProvider delayDuration={300}>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {telegramAccounts.map((account) => {
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
                                  <AvatarFallback className="bg-sky-100 font-semibold text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">
                                    {account.email.charAt(0).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex min-w-0 flex-col">
                                  <EmailCell email={account.email} />
                                  <span className="text-[11px] text-zinc-500">Telegram Storage</span>
                                </div>
                              </div>
                            </div>

                            <div className="mt-auto flex flex-col gap-3 px-4 sm:px-5 pb-4 sm:pb-5">
                              {/* Status + Sync info row */}
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <Badge variant={account.status === "online" ? "success" : account.status === "error" ? "destructive" : "neutral"} className="px-2 py-0.5 text-[10px]">
                                    <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${account.status === "online" ? "bg-emerald-500" : account.status === "syncing" ? "bg-blue-500" : account.status === "error" ? "bg-red-500" : "bg-zinc-400"}`} />
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
                                    className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-brand-50 hover:text-brand-500 disabled:opacity-40 dark:hover:bg-brand-950/50"
                                    title="Migrasi Isi Drive ke Akun Lain"
                                  >
                                    <ArrowLeftRight className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setFormatTarget({ id: account.id, email: account.email, fileCount: (account as any).fileCount ?? 0 })}
                                    className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40 dark:hover:bg-red-950/50"
                                    title="Format Storage"
                                  >
                                    <HardDrive className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteTarget({ id: account.id, email: account.email, fileCount: (account as any).fileCount ?? 0 })}
                                    disabled={deleteAccount.isPending}
                                    className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40 dark:hover:bg-red-950/50"
                                    title="Disconnect Akun"
                                  >
                                    <Power className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>

                              {/* Last synced */}
                              <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                                <RefreshCw className="h-3 w-3 shrink-0" />
                                <span className="truncate">
                                  {isSyncing ? "Sedang sinkronisasi..." : syncTime ? `Sync: ${syncTime}` : "Belum pernah sync"}
                                </span>
                              </div>

                              {/* Storage info (no progress bar, Telegram has unlimited virtual quota) */}
                              <div className="flex items-center justify-between text-xs font-semibold text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg p-2 border border-zinc-150 dark:border-zinc-800/40">
                                <span>Kapasitas:</span>
                                <span className="text-sky-600 dark:text-sky-400">{formatBytes(account.usedStorageBytes)} Terpakai</span>
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
        <AddTelegramAccountDialog open={telegramDialogOpen} onClose={() => setTelegramDialogOpen(false)} />
      </div>
    </PageTransition>
  );
}
