import { apiRequest } from "../lib/api-client";

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
};
