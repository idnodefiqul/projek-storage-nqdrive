import { apiRequest } from "../lib/client";

export type MigrationJobStatus = "running" | "completed" | "failed" | "cancelled";

export interface MigrationJob {
  taskId: string;
  sourceAccountId: string;
  targetAccountId: string;
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

export const migrationService = {
  start: (sourceAccountId: string, targetAccountId: string) =>
    apiRequest<{ job: MigrationJob }>(`/storage/accounts/${sourceAccountId}/migrate`, {
      method: "POST",
      body: { targetAccountId },
    }),

  listActive: () => apiRequest<{ jobs: MigrationJob[] }>("/storage/migrations/active"),

  listRecent: () => apiRequest<{ jobs: MigrationJob[] }>("/storage/migrations/recent"),

  process: (jobId: string) =>
    apiRequest<{ job: MigrationJob }>(`/storage/migrations/${jobId}/process`, { method: "POST" }),

  cancel: (jobId: string) =>
    apiRequest<{ job: MigrationJob }>(`/storage/migrations/${jobId}/cancel`, { method: "POST" }),
};
