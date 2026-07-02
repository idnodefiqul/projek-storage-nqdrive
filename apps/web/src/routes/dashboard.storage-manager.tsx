import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, Database, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Badge, Progress, Skeleton, TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@nqdrive/ui";
import { formatBytes } from "@nqdrive/shared";
import { useStorageManagerSummary, useSyncAllAccounts } from "../hooks/use-drive-accounts";
import { useMinLoading } from "../hooks/use-min-loading";
import { PageTransition } from "../components/page-transition";
import { motion, AnimatePresence } from "framer-motion";

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
  component: StorageManagerPage,
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
    <div className="flex min-w-0 items-center gap-2">
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="truncate font-medium text-sm text-zinc-900 dark:text-zinc-100">
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
        title={shown ? "Sembunyikan email" : "Tampilkan email"}>
        {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function StorageManagerPage() {
  const { data: summary, isLoading: isQueryLoading } = useStorageManagerSummary();
  const isLoading = useMinLoading(isQueryLoading, 600);
  const syncAll = useSyncAllAccounts();

  return (
    <PageTransition>
      <div className="flex h-full flex-col gap-6">
        {/* Header + Sync button */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Storage Manager</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Detail penggunaan storage terpusat dari semua akun Google Drive yang terhubung.
            </p>
          </div>
          <button
            onClick={() => syncAll.mutate()}
            disabled={syncAll.isPending || isLoading}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-emerald-500/25 transition-all"
          >
            <RefreshCw className={`h-4 w-4 ${syncAll.isPending ? "animate-spin" : ""}`} />
            {syncAll.isPending ? "Syncing..." : "Sync"}
          </button>
        </div>

        <Card className="shrink-0 relative overflow-hidden border-0 bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-zinc-200 dark:ring-white/5">
          {/* Colorful Google Account Avatar inspired background */}
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
            {isLoading || !summary ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-end justify-between">
                  <div className="flex flex-col">
                    <span className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                      {formatBytes(summary.usedStorageBytes)}
                    </span>
                    <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                      Terpakai dari {formatBytes(summary.totalStorageBytes)}
                    </span>
                  </div>
                  <span className="text-sm px-3 py-1 rounded-full font-semibold bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 ring-1 ring-zinc-200 dark:ring-zinc-700">
                    {summary.usedPercentage.toFixed(1)}% Terpakai
                  </span>
                </div>
                <Progress 
                  value={summary.usedPercentage} 
                  className="h-3 bg-zinc-200 dark:bg-zinc-800"
                  indicatorClassName={summary.usedPercentage > 90 ? "bg-red-500" : "bg-brand-500"} 
                />
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex-1 flex flex-col min-h-[400px]">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Daftar Partisi (Google Accounts)</h2>
          
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div
                key="skeleton"
                variants={containerVariants}
                initial="hidden"
                animate="show"
                exit="hidden"
                className="flex flex-col gap-3"
              >
                {Array.from({ length: 4 }).map((_, i) => (
                  <motion.div key={i} variants={itemVariants}>
                    <Skeleton className="h-[72px] w-full rounded-xl" />
                  </motion.div>
                ))}
              </motion.div>
            ) : summary?.accounts.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-white/50 py-12 dark:border-zinc-800 dark:bg-zinc-900/50"
              >
                <Database className="h-10 w-10 text-zinc-400 opacity-50" />
                <p className="mt-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">Belum ada partisi penyimpanan</p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Hubungkan akun Google Drive untuk memperbesar kapasitas.</p>
              </motion.div>
            ) : (
              <motion.div
                key="list"
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="flex flex-col gap-3"
              >
                {summary?.accounts.map((account) => (
                  <motion.div key={account.email} variants={itemVariants}>
                    <Card className="overflow-hidden transition-all hover:border-zinc-300 dark:hover:border-zinc-700">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4">
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <EmailCell email={account.email} />
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">
                            {account.lastSyncedAt ? `Sinkronisasi: ${new Date(account.lastSyncedAt).toLocaleString("id-ID")}` : "Belum sinkronisasi"}
                          </span>
                        </div>
                        
                        <div className="flex flex-col gap-2 sm:w-64 shrink-0">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-zinc-700 dark:text-zinc-300">{formatBytes(account.usedStorageBytes)}</span>
                            <span className="text-zinc-500">{formatBytes(account.totalStorageBytes)}</span>
                          </div>
                          <Progress 
                            value={account.usedPercentage} 
                            className="h-2"
                            indicatorClassName={account.usedPercentage > 90 ? "bg-red-500" : "bg-brand-500"} 
                          />
                        </div>
                        
                        <div className="flex shrink-0 items-center justify-end sm:w-20">
                          <Badge variant={account.status === "online" ? "success" : "destructive"} className="px-2 py-0.5 text-[10px]">
                            {account.status === "online" ? "Online" : "Offline"}
                          </Badge>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </PageTransition>
  );
}
