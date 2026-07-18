import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@nqdrive/ui";
import { migrationService, type MigrationJob } from "../services/migration.service";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  return `${local.slice(0, 3)}***@${domain}`;
}

interface MigrationContextValue {
  activeJobs: MigrationJob[];
  recentJobs: MigrationJob[];
  startMigration: (sourceAccountId: string, targetAccountId: string) => Promise<MigrationJob>;
  cancelMigration: (jobId: string) => Promise<void>;
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

  const isDocumentVisible = () =>
    typeof document === "undefined" || document.visibilityState === "visible";

  const { data: activeData } = useQuery({
    queryKey: ["migrations", "active"],
    queryFn: migrationService.listActive,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const { data: recentData } = useQuery({
    queryKey: ["migrations", "recent"],
    queryFn: migrationService.listRecent,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
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

  const runProcessingLoop = useCallback(async () => {
    if (runnerActiveRef.current) return;
    if (!isDocumentVisible()) return;
    runnerActiveRef.current = true;

    try {
      for (;;) {
        if (!isDocumentVisible()) break;

        let jobs: MigrationJob[];
        try {
          const result = await migrationService.listActive();
          jobs = result.jobs;
          queryClient.setQueryData(["migrations", "active"], result);
        } catch {
          break;
        }

        if (jobs.length === 0) break;

        for (const job of jobs) {
          try {
            const { job: updated } = await migrationService.process(job.taskId);

            queryClient.setQueryData(
              ["migrations", "active"],
              (old: { jobs: MigrationJob[] } | undefined) => ({
                jobs: (old?.jobs ?? [])
                  .map((j) => (j.taskId === updated.taskId ? updated : j))
                  .filter((j) => j.status === "running"),
              })
            );

            if (updated.status !== "running") onJobFinished(updated);
          } catch (error) {
            console.error(`Gagal memproses batch migrasi job ${job.taskId}:`, error);
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } finally {
      runnerActiveRef.current = false;
    }
  }, [queryClient, onJobFinished]);

  useEffect(() => {
    if (activeJobs.length > 0) void runProcessingLoop();
  }, [activeJobs.length, runProcessingLoop]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && activeJobs.length > 0) {
        void runProcessingLoop();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [activeJobs.length, runProcessingLoop]);

  const startMutation = useMutation({
    mutationFn: ({ sourceAccountId, targetAccountId }: { sourceAccountId: string; targetAccountId: string }) =>
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
    async (sourceAccountId: string, targetAccountId: string) => {
      const result = await startMutation.mutateAsync({ sourceAccountId, targetAccountId });
      return result.job;
    },
    [startMutation]
  );

  const cancelMigration = useCallback(
    async (jobId: string) => {
      const { job } = await migrationService.cancel(jobId);
      queryClient.setQueryData(
        ["migrations", "active"],
        (old: { jobs: MigrationJob[] } | undefined) => ({
          jobs: (old?.jobs ?? []).filter((j) => j.taskId !== job.taskId),
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
