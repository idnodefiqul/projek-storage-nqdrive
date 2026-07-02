import { apiRequest } from "../lib/client";

export interface StorageManagerSummary {
  totalStorageBytes: number;
  usedStorageBytes: number;
  availableStorageBytes: number;
  usedPercentage: number;
  totalAccounts: number;
  onlineAccounts: number;
  offlineAccounts: number;
  totalFiles: number;
  totalDownloads: number;
  accounts: Array<{
    id: number;
    email: string;
    provider: string;
    totalStorageBytes: number;
    usedStorageBytes: number;
    availableStorageBytes: number;
    usedPercentage: number;
    status: string;
    lastSyncedAt: string | null;
  }>;
}

export const storageManagerService = {
  getSummary: () => apiRequest<StorageManagerSummary>("/storage/summary"),
  syncAll: () => apiRequest<{ message: string }>("/storage/accounts/sync-all", { method: "POST" }),
};
