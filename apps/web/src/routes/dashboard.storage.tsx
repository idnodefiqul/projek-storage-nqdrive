import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  Eye, EyeOff, Database, RefreshCw, Plus, HardDrive, ArrowLeftRight, Power,
  Loader2, AlertTriangle, Search, LayoutGrid, List as ListIcon,
  Users, FileText, AlertCircle, CheckCircle2,
  Cloud, Database as DbIcon,
} from "lucide-react";
import {
  Badge,
  Skeleton,
  TooltipProvider, Tooltip, TooltipTrigger, TooltipContent,
  Button, Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Input, useToast,
} from "@nqdrive/ui";
import { formatBytes } from "@nqdrive/shared";
import { formatLocal } from "../lib/datetime";
import {
  useStorageManagerSummary, useSyncAllAccounts,
  useDriveAccounts, useDeleteDriveAccount,
  useGoogleOAuthUrl, useDropboxOAuthUrl, useOneDriveOAuthUrl,
  useFormatDriveAccount,
} from "../hooks/use-drive-accounts";
import { useMinLoading } from "../hooks/use-min-loading";
import { useMigrationGlobal } from "../stores/migration-provider";
import type { DriveAccountWithFileCount } from "../services/drive-account.service";
import { PageTransition } from "../components/page-transition";
import { CardGridSkeleton } from "../components/skeletons";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { googleDriveSvg, onedriveSvg } from "../assets";
import { SiDropbox } from "@icons-pack/react-simple-icons";
import { cn } from "@nqdrive/ui";

const bentoBase = "relative flex flex-col overflow-hidden rounded-[16px] border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] shadow-[var(--shadow-card)]";
const bentoHover = "transition-all duration-300 hover:shadow-[var(--shadow-float)] hover:border-brand-200/60 dark:hover:border-brand-500/20";

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.015, delayChildren: 0 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] as any } },
};

const ACCOUNT_COLORS = ["#0f9f9a", "#6366f1", "#0061FF", "#0078D4", "#f59e0b", "#10b981", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

const PROVIDER_LABEL: Record<string, string> = {
  google_drive: "Google Drive",
  dropbox: "Dropbox",
  onedrive: "OneDrive",
  cloudflare_r2: "Cloudflare R2",
  amazon_s3: "Amazon S3",
};
const PROVIDER_COLOR: Record<string, string> = {
  google_drive: "#0f9f9a",
  dropbox: "#0061FF",
  onedrive: "#0078D4",
  cloudflare_r2: "#f97316",
  amazon_s3: "#f59e0b",
};
const PROVIDER_BG: Record<string, string> = {
  google_drive: "bg-white dark:bg-white",
  dropbox: "bg-[#EFF4FF] dark:bg-blue-950/30",
  onedrive: "bg-blue-50 dark:bg-blue-950/20",
};
const PROVIDER_RING: Record<string, string> = {
  google_drive: "ring-green-200 dark:ring-green-800",
  dropbox: "ring-[#0061FF]/20",
  onedrive: "ring-blue-200 dark:ring-blue-800",
};
const PROVIDER_BADGE: Record<string, string> = {
  google_drive: "bg-green-50 text-green-700 ring-green-200 dark:bg-green-950/30 dark:text-green-300 dark:ring-green-800",
  dropbox: "bg-[#E8F0FF] text-[#0061FF] ring-[#0061FF]/20 dark:bg-blue-950/30 dark:text-blue-300",
  onedrive: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:ring-blue-800",
};

function ProviderIcon({ provider, className }: { provider: string; className?: string }) {
  const p = (provider || "").toLowerCase();
  if (p === "dropbox") return <SiDropbox color="#0061FF" className={cn("shrink-0", className)} />;
  if (p === "onedrive" || p === "one_drive") return <img src={onedriveSvg} alt="OneDrive" className={cn("object-contain shrink-0", className)} />;
  if (p === "google_drive" || p === "google") return <img src={googleDriveSvg} alt="Google Drive" className={cn("object-contain shrink-0", className)} />;
  return <HardDrive className={cn("text-[rgb(var(--ink-500))] shrink-0", className)} />;
}

function maskEmail(email: string) {
  const [l, d] = email.split("@");
  if (!l || !d) return email;
  if (l.length <= 3) return `${l[0]}***@${d}`;
  return `${l.slice(0, 3)}***@${d}`;
}
function EmailCell({ email, size = "sm" }: { email: string; size?: "sm" | "xs" }) {
  const [shown, setShown] = useState(false);
  const display = shown ? email : maskEmail(email);
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn("truncate font-medium text-[rgb(var(--foreground))]", size === "xs" ? "text-xs" : "text-sm")}>{display}</span>
          </TooltipTrigger>
          <TooltipContent side="top"><p>{email}</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <button type="button" onClick={() => setShown(v => !v)} className="shrink-0 rounded-full p-1 text-[rgb(var(--ink-500))] hover:bg-[rgb(var(--surface-muted))] hover:text-brand-500 transition-colors">
        {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// ─── ADD STORAGE PICKER ─────────────────────────────────────────────────────
type OAuthHook = { mutateAsync: () => Promise<{ url: string }>; isPending: boolean };
function AddStorageDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const googleOAuth = useGoogleOAuthUrl();
  const dropboxOAuth = useDropboxOAuthUrl();
  const oneDriveOAuth = useOneDriveOAuthUrl();
  const [error, setError] = useState<string | null>(null);
  const isPending = googleOAuth.isPending || dropboxOAuth.isPending || oneDriveOAuth.isPending;
  const handleClose = () => { setError(null); googleOAuth.reset(); dropboxOAuth.reset(); oneDriveOAuth.reset(); onClose(); };
  const handleOAuth = async (provider: "google_drive" | "dropbox" | "onedrive", hook: OAuthHook) => {
    setError(null);
    try {
      try { sessionStorage.setItem("last-storage-provider", provider); } catch {}
      const { url } = await hook.mutateAsync();
      window.location.href = url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Gagal memulai OAuth.";
      setError(msg);
      toast({ title: "Gagal", description: msg, variant: "error" });
    }
  };
  const providers = [
    { id: "google_drive" as const, label: "Google Drive", desc: "15GB gratis • Paling populer", icon: <img src={googleDriveSvg} alt="GDrive" className="h-9 w-9 object-contain" />, bg: "bg-white group-hover:bg-green-50/80", ring: "ring-green-200 dark:ring-green-800", badge: "Direkomendasikan", badgeColor: "bg-brand-500 text-white", hook: googleOAuth as OAuthHook },
    { id: "dropbox" as const, label: "Dropbox", desc: "2GB gratis • Sync cepat", icon: <SiDropbox color="#0061FF" className="h-9 w-9" />, bg: "bg-[#EFF4FF] dark:bg-blue-950/30 group-hover:bg-[#E0ECFF]", ring: "ring-[#0061FF]/20", badge: "Populer", badgeColor: "bg-[#0061FF] text-white", hook: dropboxOAuth as OAuthHook },
    { id: "onedrive" as const, label: "OneDrive", desc: "5GB gratis • Microsoft 365", icon: <img src={onedriveSvg} alt="OneDrive" className="h-9 w-9 object-contain" />, bg: "bg-blue-50 dark:bg-blue-950/20 group-hover:bg-blue-100/80", ring: "ring-blue-200 dark:ring-blue-800", badge: "Microsoft", badgeColor: "bg-[#0078D4] text-white", hook: oneDriveOAuth as OAuthHook },
  ];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()} className="max-w-[640px] w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto rounded-[20px] border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] p-0 scrollbar-hide">
      <div className="sticky top-0 z-10 bg-[rgb(var(--surface))] px-6 pt-6 pb-4 rounded-t-[20px]">
        <DialogHeader className="p-0 space-y-2">
          <DialogTitle className="flex items-center gap-2.5 text-[18px] font-bold tracking-tight">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500 text-white shadow-sm"><Plus className="h-5 w-5" /></span>
            Tambah Storage Baru
          </DialogTitle>
          <DialogDescription className="text-sm text-[rgb(var(--ink-500))]">Pilih provider OAuth2 secure.</DialogDescription>
        </DialogHeader>
      </div>
      <div className="px-6 pb-4 flex flex-col gap-4">
        {error && (<div className="flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3 dark:border-orange-800 dark:bg-orange-950/40"><AlertCircle className="h-4 w-4 shrink-0 text-orange-600 mt-0.5" /><p className="text-sm text-orange-700 dark:text-orange-300">{error}</p></div>)}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {providers.map((p) => (
            <button key={p.id} disabled={isPending} onClick={() => handleOAuth(p.id, p.hook)} className={cn("group relative flex flex-col items-start gap-3 rounded-[14px] border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] p-4 text-left transition-all duration-300 hover:shadow-[var(--shadow-float)] hover:border-brand-200 hover:-translate-y-0.5 disabled:opacity-60 min-h-[148px]")}>
              <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl ring-1", p.bg, p.ring)}>{p.icon}</div>
              <div className="flex-1"><div className="flex items-center gap-2"><h4 className="text-sm font-bold text-[rgb(var(--foreground))] tracking-tight">{p.label}</h4><span className={cn("inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase", p.badgeColor)}>{p.badge}</span></div><p className="mt-1 text-[11px] leading-relaxed text-[rgb(var(--ink-500))] line-clamp-2">{p.desc}</p></div>
              <div className="flex w-full items-center justify-between"><span className="text-[11px] font-semibold text-brand-600 dark:text-brand-400 flex items-center gap-1">{p.hook.isPending ? <><Loader2 className="h-3 w-3 animate-spin" /> Mengalihkan...</> : <>Hubungkan →</>}</span><span className="grid h-6 w-6 place-items-center rounded-full bg-[rgb(var(--surface-muted))] group-hover:bg-brand-500 group-hover:text-white transition-colors"><Plus className="h-3.5 w-3.5" /></span></div>
            </button>
          ))}
          {[{ label: "Cloudflare R2", icon: <Cloud className="h-9 w-9 text-orange-500" />, desc: "S3 compatible" }, { label: "Amazon S3", icon: <DbIcon className="h-9 w-9 text-amber-600" />, desc: "AWS S3" }].map((p) => (
            <div key={p.label} className="relative flex flex-col items-start gap-3 rounded-[14px] border border-dashed border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface-muted))]/40 p-4 opacity-70">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[rgb(var(--surface-muted))] ring-1 ring-[rgb(var(--border-subtle))]">{p.icon}</div>
              <div><h4 className="text-sm font-bold text-[rgb(var(--foreground))] flex items-center gap-2">{p.label}<span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300">Soon</span></h4><p className="mt-1 text-[11px] text-[rgb(var(--ink-500))]">{p.desc}</p></div>
            </div>
          ))}
        </div>
      </div>
      <div className="sticky bottom-0 bg-[rgb(var(--surface))] border-t border-[rgb(var(--border-subtle))] px-6 py-3 flex justify-end rounded-b-[20px]"><Button variant="outline" onClick={handleClose} disabled={isPending} className="rounded-xl">Tutup</Button></div>
    </Dialog>
  );
}

// ─── CONFIRM DIALOGS ────────────────────────────────────────────────────────
function ConfirmFormatDriveDialog({ open, onClose, onConfirm, accountEmail, fileCount, isPending }: { open: boolean; onClose: () => void; onConfirm: () => void; accountEmail: string; fileCount: number; isPending: boolean; }) {
  const [confirmText, setConfirmText] = useState(""); const matches = confirmText === accountEmail; const handleClose = () => { setConfirmText(""); onClose(); };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}><DialogHeader><div className="flex items-center gap-3 mb-1"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30"><AlertTriangle className="h-5 w-5 text-red-600" /></div><DialogTitle>Format Drive?</DialogTitle></div><DialogDescription className="pl-[52px]">Hapus permanen isi <strong className="text-[rgb(var(--foreground))]">{accountEmail}</strong> termasuk {fileCount} file.</DialogDescription></DialogHeader><div className="mx-4 mb-2 rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-3"><p className="text-xs font-medium text-red-700 dark:text-red-400">Tidak bisa dibatalkan.</p></div><div className="mx-4 mb-2 flex flex-col gap-1.5"><label className="text-xs font-medium text-[rgb(var(--ink-500))]">Ketik <strong className="select-all text-[rgb(var(--foreground))]">{accountEmail}</strong></label><Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={accountEmail} className="font-mono text-sm" /></div><DialogFooter><Button variant="outline" onClick={handleClose} disabled={isPending}>Batal</Button><Button variant="destructive" onClick={onConfirm} disabled={!matches || isPending}>{isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Memformat...</> : <><HardDrive className="mr-2 h-4 w-4" />Format</>}</Button></DialogFooter></Dialog>
  );
}
function ConfirmMigrateDriveDialog({ open, onClose, onConfirm, sourceAccount, accounts, isPending }: { open: boolean; onClose: () => void; onConfirm: (targetAccountId: number) => void; sourceAccount: { id: number; email: string; fileCount: number; usedBytes: number } | null; accounts: DriveAccountWithFileCount[]; isPending: boolean; }) {
  const [targetId, setTargetId] = useState<number | null>(null); const [confirmText, setConfirmText] = useState(""); useEffect(() => { if (open) { setTargetId(null); setConfirmText(""); } }, [open]); const sourceEmail = sourceAccount?.email ?? ""; const matches = confirmText === sourceEmail && targetId !== null; const candidates = accounts.filter(a => a.id !== sourceAccount?.id); const handleClose = () => { setTargetId(null); setConfirmText(""); onClose(); };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}><DialogHeader><div className="flex items-center gap-3 mb-1"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30"><ArrowLeftRight className="h-5 w-5 text-amber-600" /></div><DialogTitle>Migrasi Isi Drive?</DialogTitle></div><DialogDescription className="pl-[52px]">Pindahkan semua isi {sourceEmail} ke akun tujuan.</DialogDescription></DialogHeader><div className="mx-4 mb-2 flex flex-col gap-1.5"><label className="text-xs font-medium text-[rgb(var(--ink-500))]">Pindahkan ke akun</label><div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto scrollbar-hide">{candidates.length === 0 && <p className="text-xs text-center border border-dashed border-[rgb(var(--border-subtle))] rounded-xl p-3">Tidak ada akun lain.</p>}{candidates.map((account) => { const isOnline = account.status === "online"; const isSelected = targetId === account.id; return (<button key={account.id} type="button" disabled={!isOnline} onClick={() => setTargetId(account.id)} className={cn("flex items-center justify-between gap-2 rounded-xl border p-2.5 text-left text-sm", isSelected ? "border-brand-500 bg-brand-50 dark:bg-brand-950/30" : "border-[rgb(var(--border-subtle))]", !isOnline && "opacity-50 cursor-not-allowed")}><div className="flex items-center gap-2 min-w-0"><ProviderIcon provider={account.provider} className="h-5 w-5 shrink-0" /><div className="min-w-0"><p className="truncate text-xs font-medium">{maskEmail(account.email)}</p><p className="text-[10px] text-[rgb(var(--ink-500))]">Sisa {formatBytes(account.availableStorageBytes)} {!isOnline && "• Offline"}</p></div></div>{isSelected && <CheckCircle2 className="h-4 w-4 text-brand-500" />}</button>); })}</div></div><div className="mx-4 mb-2 flex flex-col gap-1.5"><label className="text-xs font-medium text-[rgb(var(--ink-500))]">Ketik <strong className="select-all text-[rgb(var(--foreground))]">{sourceEmail}</strong></label><Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={sourceEmail} className="font-mono text-sm" /></div><DialogFooter><Button variant="outline" onClick={handleClose} disabled={isPending}>Batal</Button><Button variant="destructive" onClick={() => targetId && onConfirm(targetId)} disabled={!matches || isPending}>{isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Memulai...</> : <><ArrowLeftRight className="mr-2 h-4 w-4" />Mulai Migrasi</>}</Button></DialogFooter></Dialog>
  );
}
function ConfirmDeleteAccountDialog({ open, onClose, onConfirm, accountEmail, fileCount, isPending }: { open: boolean; onClose: () => void; onConfirm: () => void; accountEmail: string; fileCount: number; isPending: boolean; }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}><DialogHeader><div className="flex items-center gap-3 mb-1"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30"><Power className="h-5 w-5 text-red-600" /></div><DialogTitle>Disconnect akun?</DialogTitle></div><DialogDescription className="pl-[52px]">Putuskan <strong className="text-[rgb(var(--foreground))]">{accountEmail}</strong>?</DialogDescription></DialogHeader><div className="mx-4 mb-2 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3"><p className="text-xs text-amber-700 dark:text-amber-400">{fileCount > 0 ? `${fileCount} file tetap ada tapi tidak bisa download sampai login ulang.` : "Akun akan dihapus."}</p></div><DialogFooter><Button variant="outline" onClick={onClose} disabled={isPending}>Batal</Button><Button variant="destructive" onClick={onConfirm} disabled={isPending}>{isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Disconnecting...</> : <><Power className="mr-2 h-4 w-4" />Disconnect</>}</Button></DialogFooter></Dialog>
  );
}

// ─── VOLUME HERO PREMIUM DONUT BESAR TEBAL - WARNA TEMA ───────────────────────
// User request: hilangkan bar, ganti donut ukuran hampir kontainer, lingkaran tebal, warna mengikuti tema
function VolumeHero({ total, used, available, usedPercentage, onSync, onAdd, isSyncing }: { total: number; used: number; available: number; usedPercentage: number; onSync: () => void; onAdd: () => void; isSyncing: boolean; }) {
  const status = usedPercentage >= 90 ? "critical" : usedPercentage >= 75 ? "warning" : "optimal" as "critical" | "warning" | "optimal";
  const statusMeta = status === "critical" ? { label: "Penuh", cls: "bg-red-500/10 text-red-600 ring-red-500/20 dark:text-red-300", dot: "bg-red-500" } : status === "warning" ? { label: "Hampir penuh", cls: "bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-300", dot: "bg-amber-500" } : { label: "Optimal", cls: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/15 dark:text-emerald-300", dot: "bg-emerald-500" };

  // Donut SVG crisp - free = warna tema, used = abu - garis putus lurus (butt cap)
  const freePct = Math.max(0, Math.min(100, 100 - usedPercentage));
  const radius = 42;
  const circumference = 2 * Math.PI * radius; // ~263.89
  const freeDash = (freePct / 100) * circumference;

  return (
    <div className={cn(bentoBase, bentoHover, "p-5 sm:p-6 overflow-hidden flex flex-col h-full min-h-[380px] sm:min-h-[420px] lg:min-h-[440px]")}>
      {/* blur halus tema */}
      <div className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full bg-brand-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-[var(--brand-b)]/10 blur-3xl" />

      {/* Header: pure icon */}
      <div className="relative z-10 flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-[var(--brand-a)]" />
            <h2 className="text-[15px] font-bold tracking-tight text-[rgb(var(--foreground))]">Storage Volume</h2>
          </div>
          <span className={cn("shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1", statusMeta.cls)}><span className={cn("h-1.5 w-1.5 rounded-full", statusMeta.dot)} />{statusMeta.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onSync} disabled={isSyncing} className="inline-flex h-8 sm:h-9 items-center justify-center gap-1.5 rounded-xl border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] px-3 text-xs sm:text-sm font-semibold text-[rgb(var(--ink-500))] shadow-sm hover:bg-[rgb(var(--surface-muted))] transition disabled:opacity-60">
            <RefreshCw className={cn("h-3.5 w-3.5 sm:h-4 sm:w-4", isSyncing && "animate-spin")} /><span>{isSyncing ? "Syncing..." : "Sync"}</span>
          </button>
          <button onClick={onAdd} className="inline-flex h-8 sm:h-9 items-center justify-center gap-1.5 rounded-xl bg-brand-500 px-3 sm:px-4 text-xs sm:text-sm font-bold text-white shadow-sm shadow-brand-500/20 hover:bg-brand-600 transition"><Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" /><span>Add Storage</span></button>
        </div>
      </div>

      {/* Donut SVG besar tebal - garis lurus crisp, warna tema */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-5 py-4 sm:py-2 lg:flex-row lg:gap-8 lg:py-0">
        <div className="relative flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-brand-500/15 blur-2xl scale-90 pointer-events-none" />
          <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="relative">
            <div className="relative h-[220px] w-[220px] sm:h-[260px] sm:w-[260px] lg:h-[300px] lg:w-[300px] shrink-0 rounded-full shadow-sm ring-1 ring-[rgb(var(--border-subtle))]/50 bg-[rgb(var(--surface))] grid place-items-center">
              <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
                {/* Used = abu background full */}
                <circle cx="50" cy="50" r={radius} fill="none" stroke="rgb(var(--surface-muted))" strokeWidth="16" className="transition-colors" />
                {/* Free = warna tema - garis putus lurus butt cap, bukan round */}
                <motion.circle
                  cx="50" cy="50" r={radius} fill="none"
                  stroke="var(--brand-a)"
                  strokeWidth="16"
                  strokeLinecap="butt"
                  strokeDasharray={`${freeDash} ${circumference}`}
                  initial={{ strokeDasharray: `0 ${circumference}` }}
                  animate={{ strokeDasharray: `${freeDash} ${circumference}` }}
                  transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
                  className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                />
              </svg>
              {/* inner hole tebal */}
              <div className="absolute inset-[28px] sm:inset-[36px] lg:inset-[44px] rounded-full bg-[rgb(var(--surface))] shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] grid place-items-center ring-1 ring-[rgb(var(--border-subtle))]/30">
                <div className="text-center px-2">
                  <p className="font-mono text-[36px] sm:text-[42px] lg:text-[44px] font-[800] leading-none tracking-[-0.03em] text-[rgb(var(--foreground))] tabular-nums">{usedPercentage.toFixed(0)}%</p>
                  <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[rgb(var(--ink-500))]">Terpakai</p>
                  <div className="mt-3 flex flex-col items-center gap-1">
                    <p className="font-mono text-[13px] font-bold text-[rgb(var(--foreground))] tabular-nums">{formatBytes(used)}</p>
                    <p className="text-[11px] text-[rgb(var(--ink-500))]">dari {formatBytes(total)}</p>
                    <p className="mt-1 text-[11px] font-medium text-[rgb(var(--ink-500))]">Sisa {formatBytes(available)}</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Right info compact - Android rapih 1 col mobile */}
        <div className="flex flex-col items-center lg:items-start gap-3 sm:gap-4 w-full max-w-[220px]">
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-1 lg:gap-3">
            <div className="flex items-center justify-between rounded-xl border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] px-3 py-2.5">
              <span className="flex items-center gap-2 text-[11px] font-medium text-[rgb(var(--ink-500))]"><span className="h-2.5 w-2.5 rounded-full bg-[rgb(var(--surface-muted))] shrink-0" />Used</span>
              <span className="font-mono text-xs font-bold tabular-nums text-[rgb(var(--foreground))] truncate max-w-[100px] sm:max-w-none">{formatBytes(used)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-[rgb(var(--border-subtle))] bg-brand-500/10 px-3 py-2.5 ring-1 ring-brand-500/10">
              <span className="flex items-center gap-2 text-[11px] font-bold text-brand-700 dark:text-brand-300"><span className="h-2.5 w-2.5 rounded-full bg-[var(--brand-a)] shrink-0" />Free</span>
              <span className="font-mono text-xs font-bold tabular-nums text-brand-700 dark:text-brand-300 truncate max-w-[100px] sm:max-w-none">{formatBytes(available)}</span>
            </div>
          </div>
          <div className="h-px w-full bg-[rgb(var(--border-subtle))]/60 hidden sm:block" />
          <div className="flex items-center justify-center lg:justify-start gap-1.5 w-full">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="text-[11px] font-bold tracking-wide text-[rgb(var(--foreground))]">Connected All Account</span>
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-auto pt-2 flex items-center justify-between text-[11px] text-[rgb(var(--ink-500))] shrink-0">
        <span>Penyimpanan terenkripsi • OAuth2</span>
        <span className="font-mono text-[11px] font-bold tabular-nums">{usedPercentage.toFixed(1)}% • {formatBytes(total)} total</span>
      </div>
    </div>
  );
}

function KpiSquare({ label, value, sub, icon: Icon, tone }: { label: string; value: React.ReactNode; sub?: string; icon: any; tone?: "brand" | "violet" | "emerald" | "amber" }) {
  const toneCls = tone === "brand" ? "text-[var(--brand-a)]" : tone === "violet" ? "text-violet-500" : tone === "emerald" ? "text-emerald-500" : tone === "amber" ? "text-amber-500" : "text-[rgb(var(--ink-500))]";
  return (
    <div className={cn(bentoBase, bentoHover, "p-4 sm:p-5 flex flex-col items-center justify-center text-center aspect-square min-h-[160px] sm:min-h-[180px]")}>
      <div className="flex flex-col items-center gap-2"><span className={cn("grid h-10 w-10 place-items-center rounded-xl bg-[rgb(var(--surface-muted))] ring-1 ring-[rgb(var(--border-subtle))]", toneCls)}><Icon className="h-5 w-5" strokeWidth={2.2} /></span><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[rgb(var(--ink-500))] leading-tight mt-1">{label}</p></div>
      <div className="flex flex-1 flex-col items-center justify-center py-2"><p className="font-mono text-[28px] sm:text-[30px] font-[800] leading-none tracking-[-0.02em] text-[rgb(var(--foreground))] tabular-nums">{value}</p>{sub && <p className="mt-2 text-[11px] leading-tight text-[rgb(var(--ink-500))] max-w-[14ch]">{sub}</p>}</div>
      <div className="h-1 w-10 rounded-full bg-[rgb(var(--surface-muted))] overflow-hidden mt-auto"><div className={cn("h-full rounded-full", tone === "brand" ? "bg-[var(--brand-a)]" : tone === "amber" ? "bg-amber-500" : tone === "emerald" ? "bg-emerald-500" : "bg-violet-500")} style={{ width: "100%" }} /></div>
    </div>
  );
}

function PremiumAccountCard({ account, index, onFormat, onMigrate, onDelete, activeJobs }: { account: DriveAccountWithFileCount; index: number; onFormat: () => void; onMigrate: () => void; onDelete: () => void; activeJobs: any[] }) {
  const usagePct = account.totalStorageBytes > 0 ? Math.min(100, Math.max(0, (account.usedStorageBytes / account.totalStorageBytes) * 100)) : 0;
  const isDanger = usagePct > 90; const isWarning = usagePct > 75 && usagePct <= 90; const isSyncing = account.status === "syncing"; const isMigrating = activeJobs.some((j: any) => j.sourceAccountId === account.id || j.targetAccountId === account.id); const provider = (account.provider || "google_drive").toLowerCase(); const badgeCls = PROVIDER_BADGE[provider] || "bg-[rgb(var(--surface-muted))] text-[rgb(var(--ink-500))] ring-[rgb(var(--border-subtle))]";
  return (
    <motion.div variants={itemVariants} className="h-full">
      <div className={cn(bentoBase, bentoHover, "group h-full p-5 flex flex-col gap-4")}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {/* Pure icon tanpa background/lingkaran & tanpa titik hijau (badge sudah ada) */}
            <div className="h-10 w-10 sm:h-11 sm:w-11 shrink-0 flex items-center justify-center">
              <ProviderIcon provider={provider} className="h-8 w-8 sm:h-9 sm:w-9 lg:h-10 lg:w-10 object-contain" />
            </div>
            <div className="min-w-0 flex-1"><EmailCell email={account.email} size="sm" /><span className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 tabular-nums" title={provider}><span className={cn("h-1.5 w-1.5 rounded-full", account.status === "online" ? "bg-emerald-500" : account.status === "error" ? "bg-red-500" : "bg-zinc-400")} />{account.status === "online" ? "Online" : account.status === "syncing" ? "Syncing" : account.status === "error" ? "Error" : "Offline"}</span></div>
          </div>
          <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
            <button onClick={onMigrate} disabled={isMigrating} title="Migrasi" className="grid h-8 w-8 place-items-center rounded-full border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] text-[rgb(var(--ink-500))] hover:bg-brand-50 hover:text-brand-600 hover:border-brand-200 transition disabled:opacity-40"><ArrowLeftRight className="h-4 w-4" /></button>
            <button onClick={onFormat} title="Format" className="grid h-8 w-8 place-items-center rounded-full border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] text-[rgb(var(--ink-500))] hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition"><HardDrive className="h-4 w-4" /></button>
            <button onClick={onDelete} title="Disconnect" className="grid h-8 w-8 place-items-center rounded-full border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] text-[rgb(var(--ink-500))] hover:bg-red-50 hover:text-red-600 transition"><Power className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="flex items-center gap-2"><span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1", badgeCls)}><ProviderIcon provider={provider} className="h-3.5 w-3.5" />{PROVIDER_LABEL[provider] || provider}</span><span className="text-[11px] text-[rgb(var(--ink-500))]">{account.fileCount ?? 0} file</span>{isSyncing && <span className="inline-flex items-center gap-1 text-[10px] text-blue-600"><RefreshCw className="h-3 w-3 animate-spin" />Syncing</span>}{isMigrating && <span className="inline-flex items-center gap-1 text-[10px] text-amber-600"><Loader2 className="h-3 w-3 animate-spin" />Migrating</span>}</div>
        <div className="mt-auto flex flex-col gap-2"><div className="flex items-center justify-between text-[11px] font-medium tabular-nums"><span className="text-[rgb(var(--foreground))]">{formatBytes(account.usedStorageBytes)}</span><span className="text-[rgb(var(--ink-500))]">{formatBytes(account.totalStorageBytes)}</span></div><div className="relative h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--surface-muted))] ring-1 ring-[rgb(var(--border-subtle))]/50"><motion.div initial={{ width: "8%" }} animate={{ width: `${usagePct}%` }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] as any, delay: index * 0.04 }} className={cn("absolute left-0 top-0 h-full rounded-full", isDanger ? "bg-gradient-to-r from-red-400 to-red-500" : isWarning ? "bg-gradient-to-r from-amber-400 to-amber-500" : "bg-gradient-to-r from-[var(--brand-a)] to-[var(--color-brand-300)]")} /></div><div className="flex items-center justify-between"><span className="text-[10px] text-[rgb(var(--ink-500))]">{account.lastSyncedAt ? `Sync ${formatLocal(account.lastSyncedAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : "Belum sync"}</span><span className={cn("text-[11px] font-bold tabular-nums", isDanger ? "text-red-600" : isWarning ? "text-amber-600" : "text-[rgb(var(--ink-500))]")}>{usagePct.toFixed(1)}%</span></div></div>
      </div>
    </motion.div>
  );
}

export const Route = createFileRoute("/dashboard/storage")({
  component: StoragePage,
});

function StoragePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "online" | "error" | "warning">("all");
  const [view, setView] = useState<"grid" | "list">("grid");

  const hasHandledRef = useRef(false);
  useEffect(() => {
    if (hasHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const oauth = params.get("oauth");
    if (!oauth) return;
    hasHandledRef.current = true;
    if (oauth === "success") {
      const email = params.get("email") ?? "";
      const masked = email ? maskEmail(email) : "Akun";
      // provider dari query param (baru) fallback sessionStorage
      let provider: string | null = params.get("provider");
      if (!provider) {
        try { provider = sessionStorage.getItem("last-storage-provider"); } catch {}
      }
      try { sessionStorage.removeItem("last-storage-provider"); } catch {}

      // Notif premium dengan pure icon SVG sesuai storage + masked email ***
      const providerKey = provider || "google_drive";
      toast({
        title: "Akun berhasil terhubung",
        description: (
          <span className="inline-flex items-center gap-2">
            <ProviderIcon provider={providerKey} className="h-4 w-4 shrink-0" />
            <span className="font-mono font-bold">{masked}</span>
            <span className="text-white/70">• {PROVIDER_LABEL[providerKey] || providerKey}</span>
          </span>
        ) as any,
        variant: "success",
      });

      queryClient.invalidateQueries({ queryKey: ["drive-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["storage-manager"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } else {
      const reason = params.get("reason") ?? "Terjadi kesalahan.";
      const desc = params.get("desc");
      const prov = params.get("provider");
      toast({
        title: "Gagal menambahkan storage",
        description: prov ? `${reason} • ${PROVIDER_LABEL[prov] || prov}${desc ? `: ${desc}` : ""}` : desc ? `${reason}: ${desc}` : reason,
        variant: "error",
      });
    }
    // delay replace biar toast sempat mount
    setTimeout(() => {
      window.history.replaceState({}, "", window.location.pathname);
    }, 350);
  }, [toast, queryClient]);

  const { data: summary, isLoading: isSummaryLoading } = useStorageManagerSummary();
  const isStorageLoading = useMinLoading(isSummaryLoading, 400);
  const syncAll = useSyncAllAccounts();
  const { data: accountsData, isLoading: isAccountsLoadingRaw } = useDriveAccounts();
  const isAccountsLoading = useMinLoading(isAccountsLoadingRaw, 400);
  const allAccounts = useMemo(() => accountsData?.accounts ?? [], [accountsData]);
  const deleteAccount = useDeleteDriveAccount();
  const formatDrive = useFormatDriveAccount();
  const [formatTarget, setFormatTarget] = useState<{ id: number; email: string; fileCount: number } | null>(null);
  const { startMigration, isStarting: isMigrationStarting, activeJobs } = useMigrationGlobal();
  const [migrateSource, setMigrateSource] = useState<{ id: number; email: string; fileCount: number; usedBytes: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; email: string; fileCount: number } | null>(null);

  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allAccounts.filter(acc => {
      const matchSearch = !q || acc.email.toLowerCase().includes(q) || acc.provider.toLowerCase().includes(q);
      const pct = acc.totalStorageBytes > 0 ? (acc.usedStorageBytes / acc.totalStorageBytes) * 100 : 0;
      const matchFilter = filter === "all" ? true : filter === "online" ? acc.status === "online" : filter === "error" ? acc.status === "error" : pct > 75;
      return matchSearch && matchFilter;
    });
  }, [allAccounts, search, filter]);

  const providerStats = useMemo(() => {
    const map = new Map<string, { used: number; count: number }>();
    for (const a of allAccounts) { const key = (a.provider || "google_drive").toLowerCase(); const cur = map.get(key) || { used: 0, count: 0 }; cur.used += a.usedStorageBytes || 0; cur.count += 1; map.set(key, cur); }
    return Array.from(map.entries()).map(([provider, v]) => ({ provider, ...v }));
  }, [allAccounts]);

  const kpiData = useMemo(() => {
    const total = allAccounts.length;
    const online = allAccounts.filter(a => a.status === "online").length;
    const warning = allAccounts.filter(a => { const pct = a.totalStorageBytes > 0 ? (a.usedStorageBytes / a.totalStorageBytes) * 100 : 0; return pct > 75; }).length;
    const totalFiles = allAccounts.reduce((s, a) => s + (a.fileCount ?? 0), 0);
    return { total, online, warning, totalFiles };
  }, [allAccounts]);

  const handleDeleteConfirm = async () => { if (!deleteTarget) return; try { await deleteAccount.mutateAsync(deleteTarget.id); toast({ title: "Akun diputus", variant: "success" }); } catch (e) { toast({ title: "Gagal", description: e instanceof Error ? e.message : undefined, variant: "error" }); } finally { setDeleteTarget(null); } };
  const handleMigrateConfirm = async (targetId: number) => { if (!migrateSource) return; try { await startMigration(migrateSource.id, targetId); toast({ title: "Migrasi dimulai", description: "Pantau progress di icon Send kanan atas.", variant: "success" }); setMigrateSource(null); } catch (e) { toast({ title: "Gagal migrasi", description: e instanceof Error ? e.message : undefined, variant: "error" }); } };
  const handleFormatConfirm = async () => { if (!formatTarget) return; try { const r = await formatDrive.mutateAsync(formatTarget.id); toast({ title: `${r.deletedFiles} file dihapus dari ${formatTarget.email}`, variant: "success" }); } catch (e) { toast({ title: "Gagal format", description: e instanceof Error ? e.message : undefined, variant: "error" }); } finally { setFormatTarget(null); } };

  return (
    <PageTransition>
      <div className="flex h-full flex-col gap-5 pb-10">
        {/* Hero + 4 kotak square: Volume kiri besar, kanan 2x2 kotak persegi */}
        {isStorageLoading || !summary ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr]">
            <Skeleton className="h-[360px] w-full rounded-[16px]" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="aspect-square rounded-[16px]" />
              <Skeleton className="aspect-square rounded-[16px]" />
              <Skeleton className="aspect-square rounded-[16px]" />
              <Skeleton className="aspect-square rounded-[16px]" />
            </div>
          </div>
        ) : (
          <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr] lg:items-stretch">
            <motion.div variants={itemVariants} className="h-full"><VolumeHero total={summary.totalStorageBytes} used={summary.usedStorageBytes} available={summary.availableStorageBytes} usedPercentage={summary.usedPercentage} onSync={() => syncAll.mutate()} onAdd={() => setDialogOpen(true)} isSyncing={syncAll.isPending} /></motion.div>
            <motion.div variants={containerVariants} className="grid grid-cols-2 gap-3 auto-rows-fr">
              <motion.div variants={itemVariants}><KpiSquare label="Total Akun Terhubung" value={kpiData.total} sub={`${kpiData.online} online`} icon={Users} tone="brand" /></motion.div>
              <motion.div variants={itemVariants}><KpiSquare label="Total File di Pool" value={kpiData.totalFiles.toLocaleString("id-ID")} sub={`${summary.totalDownloads.toLocaleString("id-ID")} download`} icon={FileText} tone="violet" /></motion.div>
              <motion.div variants={itemVariants}><KpiSquare label="Akun Online" value={`${kpiData.online}/${kpiData.total}`} sub={kpiData.online === kpiData.total ? "Semua Optimal" : `${kpiData.total - kpiData.online} offline`} icon={CheckCircle2} tone="emerald" /></motion.div>
              <motion.div variants={itemVariants}><KpiSquare label="Berisiko >75%" value={kpiData.warning} sub={kpiData.warning === 0 ? "Aman" : `${kpiData.warning} perlu perhatian`} icon={AlertTriangle} tone="amber" /></motion.div>
            </motion.div>
          </motion.div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-2">
            <div className="relative flex-1 max-w-[320px]"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--ink-500))]" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari email, provider..." className="h-9 w-full rounded-xl border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] pl-9 pr-3 text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--ink-500))]/60 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" /></div>
            <div className="hidden sm:flex items-center gap-1 rounded-xl border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface-muted))]/70 p-1">
              {[{ id: "all", label: "Semua" }, { id: "online", label: "Online" }, { id: "error", label: "Error" }, { id: "warning", label: "Penuh" }].map(f => (<button key={f.id} onClick={() => setFilter(f.id as any)} className={cn("rounded-lg px-2.5 py-1 text-xs font-bold transition", filter === f.id ? "bg-[rgb(var(--surface))] text-[rgb(var(--foreground))] shadow-sm ring-1 ring-[rgb(var(--border-subtle))]" : "text-[rgb(var(--ink-500))] hover:text-[rgb(var(--foreground))]")}>{f.label}</button>))}
            </div>
          </div>
          <div className="flex items-center gap-2"><span className="text-[11px] font-medium text-[rgb(var(--ink-500))] hidden sm:inline">{filteredAccounts.length} akun</span><div className="flex items-center gap-1 rounded-xl border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] p-1"><button onClick={() => setView("grid")} className={cn("grid h-7 w-7 place-items-center rounded-lg transition", view === "grid" ? "bg-brand-500 text-white shadow-sm" : "text-[rgb(var(--ink-500))] hover:bg-[rgb(var(--surface-muted))]")}><LayoutGrid className="h-4 w-4" /></button><button onClick={() => setView("list")} className={cn("grid h-7 w-7 place-items-center rounded-lg transition", view === "list" ? "bg-brand-500 text-white shadow-sm" : "text-[rgb(var(--ink-500))] hover:bg-[rgb(var(--surface-muted))]")}><ListIcon className="h-4 w-4" /></button></div></div>
        </div>

        <div className="flex sm:hidden items-center gap-1 overflow-x-auto scrollbar-hide">
          {[{ id: "all", label: "Semua" }, { id: "online", label: "Online" }, { id: "error", label: "Error" }, { id: "warning", label: "Penuh" }].map(f => (<button key={f.id} onClick={() => setFilter(f.id as any)} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition", filter === f.id ? "bg-brand-500 text-white border-brand-500" : "bg-[rgb(var(--surface))] text-[rgb(var(--ink-500))] border-[rgb(var(--border-subtle))]")}>{f.label}</button>))}
        </div>

        <div className="flex-1 flex flex-col min-h-[300px]">
          <AnimatePresence mode="wait">
            {isAccountsLoading ? (<motion.div key="skeleton" variants={containerVariants} initial="hidden" animate="show" exit="hidden"><CardGridSkeleton count={6} /></motion.div>) : filteredAccounts.length === 0 ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col items-center justify-center rounded-[16px] border border-dashed border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))]/50 py-16 px-6 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgb(var(--surface-muted))] ring-1 ring-[rgb(var(--border-subtle))]"><HardDrive className="h-7 w-7 text-[rgb(var(--ink-500))] opacity-60" /></div><p className="mt-4 text-sm font-bold text-[rgb(var(--foreground))]">{search || filter !== "all" ? "Tidak ada akun sesuai filter" : "Belum ada storage terhubung"}</p><p className="mt-1 max-w-sm text-xs text-[rgb(var(--ink-500))]">{search ? `Tidak ditemukan untuk "${search}"` : "Klik Add Storage untuk menghubungkan Google Drive, Dropbox, atau OneDrive via OAuth2."}</p>{!search && filter === "all" && (<Button onClick={() => setDialogOpen(true)} className="mt-4 rounded-xl"><Plus className="mr-1 h-4 w-4" />Add Storage</Button>)}</motion.div>
            ) : view === "grid" ? (
              <motion.div key="grid" variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredAccounts.map((acc, idx) => (<PremiumAccountCard key={acc.id} account={acc} index={idx} activeJobs={activeJobs} onFormat={() => setFormatTarget({ id: acc.id, email: acc.email, fileCount: acc.fileCount ?? 0 })} onMigrate={() => setMigrateSource({ id: acc.id, email: acc.email, fileCount: acc.fileCount ?? 0, usedBytes: acc.usedStorageBytes })} onDelete={() => setDeleteTarget({ id: acc.id, email: acc.email, fileCount: acc.fileCount ?? 0 })} />))}
              </motion.div>
            ) : (
              <motion.div key="list" variants={containerVariants} initial="hidden" animate="show" className="flex flex-col gap-2">
                {filteredAccounts.map((acc) => {
                  const pct = acc.totalStorageBytes > 0 ? (acc.usedStorageBytes / acc.totalStorageBytes) * 100 : 0;
                  return (
                    <motion.div key={acc.id} variants={itemVariants} className={cn(bentoBase, "flex items-center gap-3 p-3 sm:p-4")}>
                      <div className="grid h-10 w-10 place-items-center rounded-xl bg-[rgb(var(--surface-muted))] ring-1 ring-[rgb(var(--border-subtle))]"><ProviderIcon provider={acc.provider} className="h-6 w-6" /></div>
                      <div className="min-w-0 flex-1"><EmailCell email={acc.email} size="sm" /><div className="flex items-center gap-2 mt-0.5"><Badge variant={acc.status === "online" ? "success" : acc.status === "error" ? "destructive" : "neutral"} className="px-2 py-0.5 text-[10px]">{acc.status}</Badge><span className="text-[11px] text-[rgb(var(--ink-500))]">{formatBytes(acc.usedStorageBytes)} / {formatBytes(acc.totalStorageBytes)} • {pct.toFixed(1)}%</span></div><div className="mt-2 h-1.5 w-full max-w-[240px] overflow-hidden rounded-full bg-[rgb(var(--surface-muted))]"><div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} /></div></div>
                      <div className="flex items-center gap-1"><button onClick={() => setMigrateSource({ id: acc.id, email: acc.email, fileCount: acc.fileCount ?? 0, usedBytes: acc.usedStorageBytes })} className="grid h-8 w-8 place-items-center rounded-full hover:bg-[rgb(var(--surface-muted))]"><ArrowLeftRight className="h-4 w-4" /></button><button onClick={() => setFormatTarget({ id: acc.id, email: acc.email, fileCount: acc.fileCount ?? 0 })} className="grid h-8 w-8 place-items-center rounded-full hover:bg-red-50 hover:text-red-600"><HardDrive className="h-4 w-4" /></button><button onClick={() => setDeleteTarget({ id: acc.id, email: acc.email, fileCount: acc.fileCount ?? 0 })} className="grid h-8 w-8 place-items-center rounded-full hover:bg-red-50 hover:text-red-600"><Power className="h-4 w-4" /></button></div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <ConfirmFormatDriveDialog open={!!formatTarget} onClose={() => setFormatTarget(null)} onConfirm={handleFormatConfirm} accountEmail={formatTarget?.email ?? ""} fileCount={formatTarget?.fileCount ?? 0} isPending={formatDrive.isPending} />
        <ConfirmMigrateDriveDialog open={!!migrateSource} onClose={() => setMigrateSource(null)} onConfirm={handleMigrateConfirm} sourceAccount={migrateSource} accounts={allAccounts} isPending={isMigrationStarting} />
        <ConfirmDeleteAccountDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDeleteConfirm} accountEmail={deleteTarget?.email ?? ""} fileCount={deleteTarget?.fileCount ?? 0} isPending={deleteAccount.isPending} />
        <AddStorageDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      </div>
    </PageTransition>
  );
}
