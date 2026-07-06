import { apiRequest } from "../lib/client";

export type MigrationJobStatus = "running" | "completed" | "failed" | "cancelled";

export interface MigrationJob {
  id: number;
  sourceAccountId: number;
  targetAccountId: number;
  sourceEmail: string;
  targetEmail: string;
  status: MigrationJobStatus;
  totalFiles: number;
  migratedFiles: number;
  failedFiles: number;
  totalBytes: number;
  migratedBytes: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

/**
 * Service migrasi isi Google Drive antar akun.
 * Job dibuat sekali, lalu /process dipanggil berulang oleh MigrationProvider
 * (loop latar belakang) sampai job selesai — mirip pola chunked upload.
 */
export const migrationService = {
  start: (sourceAccountId: number, targetAccountId: number) =>
    apiRequest<{ job: MigrationJob }>(`/storage/accounts/${sourceAccountId}/migrate`, {
      method: "POST",
      body: { targetAccountId },
    }),

  listActive: () => apiRequest<{ jobs: MigrationJob[] }>("/storage/migrations/active"),

  listRecent: () => apiRequest<{ jobs: MigrationJob[] }>("/storage/migrations/recent"),

  process: (jobId: number) =>
    apiRequest<{ job: MigrationJob }>(`/storage/migrations/${jobId}/process`, { method: "POST" }),

  cancel: (jobId: number) =>
    apiRequest<{ job: MigrationJob }>(`/storage/migrations/${jobId}/cancel`, { method: "POST" }),
};
