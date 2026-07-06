import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@nqdrive/ui";
import { migrationService, type MigrationJob } from "../services/migration.service";

/**
 * MigrationProvider — menjalankan migrasi drive antar akun di latar belakang.
 *
 * State job ada di D1 (server). Provider ini hanya "pemencet tombol":
 * selama ada job berjalan, ia memanggil POST /migrations/:id/process berulang
 * (satu batch kecil per panggilan) dan menyimpan respons ke cache react-query
 * sehingga progress bar di sidebar ter-update real-time.
 *
 * Di-mount di level layout dashboard (seperti UploadProvider) — pindah-pindah
 * halaman dashboard tidak menghentikan loop. Kalau tab ditutup, cron worker
 * tiap 10 menit yang melanjutkan.
 */

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  return `${local.slice(0, 3)}***@${domain}`;
}

interface MigrationContextValue {
  activeJobs: MigrationJob[];
  recentJobs: MigrationJob[];
  startMigration: (sourceAccountId: number, targetAccountId: number) => Promise<MigrationJob>;
  cancelMigration: (jobId: number) => Promise<void>;
  isStarting: boolean;
}

const MigrationContext = createContext<MigrationContextValue | null>(null);

export function useMigrationGlobal(): MigrationContextValue {
  const context = useContext(MigrationContext);
  if (!context) throw new Error("useMigrationGlobal must be used within MigrationProvider");
  return context;
}

export { maskEmail };

export function MigrationProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const runnerActiveRef = useRef(false);

  // Poll pelan sebagai deteksi job (misal job yang dilanjutkan cron / tab lain).
  // Update real-time datang dari respons /process di loop bawah, bukan dari poll ini.
  const { data: activeData } = useQuery({
    queryKey: ["migrations", "active"],
    queryFn: migrationService.listActive,
    refetchInterval: 15_000,
  });

  const { data: recentData } = useQuery({
    queryKey: ["migrations", "recent"],
    queryFn: migrationService.listRecent,
    refetchInterval: 30_000,
  });

  const activeJobs = activeData?.jobs ?? [];
  const recentJobs = recentData?.jobs ?? [];

  const onJobFinished = useCallback(
    (job: MigrationJob) => {
      if (job.status === "completed") {
        toast({
          title: `Migrasi selesai: ${job.migratedFiles} file dipindahkan`,
          description: `${maskEmail(job.sourceEmail)} → ${maskEmail(job.targetEmail)}${job.failedFiles > 0 ? ` (${job.failedFiles} file gagal)` : ""}`,
          variant: "success",
        });
      } else if (job.status === "failed") {
        toast({
          title: "Migrasi gagal",
          description: job.error ?? `${maskEmail(job.sourceEmail)} → ${maskEmail(job.targetEmail)}`,
          variant: "error",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["drive-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["storage-manager"] });
      queryClient.invalidateQueries({ queryKey: ["migrations"] });
    },
    [queryClient, toast]
  );

  /**
   * Loop pemroses: jalan terus selama masih ada job 'running'.
   * runnerActiveRef menjamin hanya satu loop hidup meski effect terpicu berulang.
   */
  const runProcessingLoop = useCallback(async () => {
    if (runnerActiveRef.current) return;
    runnerActiveRef.current = true;

    try {
      for (;;) {
        let jobs: MigrationJob[];
        try {
          const result = await migrationService.listActive();
          jobs = result.jobs;
          queryClient.setQueryData(["migrations", "active"], result);
        } catch {
          // Jaringan bermasalah — coba lagi nanti lewat poll berikutnya.
          break;
        }

        if (jobs.length === 0) break;

        for (const job of jobs) {
          try {
            const { job: updated } = await migrationService.process(job.id);

            // Simpan progress terbaru ke cache agar sidebar langsung ter-update.
            queryClient.setQueryData(
              ["migrations", "active"],
              (old: { jobs: MigrationJob[] } | undefined) => ({
                jobs: (old?.jobs ?? [])
                  .map((j) => (j.id === updated.id ? updated : j))
                  .filter((j) => j.status === "running"),
              })
            );

            if (updated.status !== "running") onJobFinished(updated);
          } catch (error) {
            console.error(`Gagal memproses batch migrasi job ${job.id}:`, error);
            // Jangan hammer server saat error — tunggu sebentar.
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }
        }

        // Jeda singkat antar putaran supaya tidak spin saat item sedang
        // diproses invocation lain (status 'processing' di server).
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } finally {
      runnerActiveRef.current = false;
    }
  }, [queryClient, onJobFinished]);

  // Nyalakan loop setiap kali terdeteksi ada job berjalan.
  useEffect(() => {
    if (activeJobs.length > 0) void runProcessingLoop();
  }, [activeJobs.length, runProcessingLoop]);

  const startMutation = useMutation({
    mutationFn: ({ sourceAccountId, targetAccountId }: { sourceAccountId: number; targetAccountId: number }) =>
      migrationService.start(sourceAccountId, targetAccountId),
    onSuccess: (data) => {
      queryClient.setQueryData(
        ["migrations", "active"],
        (old: { jobs: MigrationJob[] } | undefined) => ({
          jobs: [...(old?.jobs ?? []), data.job],
        })
      );
      void runProcessingLoop();
    },
  });

  const startMigration = useCallback(
    async (sourceAccountId: number, targetAccountId: number) => {
      const result = await startMutation.mutateAsync({ sourceAccountId, targetAccountId });
      return result.job;
    },
    [startMutation]
  );

  const cancelMigration = useCallback(
    async (jobId: number) => {
      const { job } = await migrationService.cancel(jobId);
      queryClient.setQueryData(
        ["migrations", "active"],
        (old: { jobs: MigrationJob[] } | undefined) => ({
          jobs: (old?.jobs ?? []).filter((j) => j.id !== jobId),
        })
      );
      queryClient.invalidateQueries({ queryKey: ["migrations"] });
      queryClient.invalidateQueries({ queryKey: ["drive-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["storage-manager"] });
      toast({
        title: "Migrasi dibatalkan",
        description: `${job.migratedFiles} file sudah terlanjur dipindahkan ke ${maskEmail(job.targetEmail)}.`,
        variant: "info",
      });
    },
    [queryClient, toast]
  );

  return (
    <MigrationContext.Provider
      value={{
        activeJobs,
        recentJobs,
        startMigration,
        cancelMigration,
        isStarting: startMutation.isPending,
      }}
    >
      {children}
    </MigrationContext.Provider>
  );
}
