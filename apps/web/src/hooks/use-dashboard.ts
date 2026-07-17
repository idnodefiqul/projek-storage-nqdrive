import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/client";
import type { FileEntity, Folder } from "@nqdrive/types";

export interface DashboardSummary {
  totalStorageBytes: number;
  usedStorageBytes: number;
  availableStorageBytes: number;
  usedPercentage: number;
  totalAccounts: number;
  onlineAccounts: number;
  offlineAccounts: number;
  totalFiles: number;
  totalDownloads: number;
}

export interface AccountStorageInfo {
  id: number;
  email: string;
  provider: import("@nqdrive/types").StorageProviderType;
  usedStorageBytes: number;
  totalStorageBytes: number;
  status?: string;
}

export interface CountryDownload {
  country: string;
  count: number;
}

export interface DashboardMetricsResponse {
  summary: DashboardSummary;
  accountsStorage: AccountStorageInfo[];
  topCountries: CountryDownload[];
  topDownloadedFiles: FileEntity[];
  recentFiles: FileEntity[];
  recentFolders: Folder[];
}

export interface ChartDataPoint {
  date: string;
  downloads: number;
  uploads: number;
}

export interface DashboardAnalyticsResponse {
  chartData: ChartDataPoint[];
}

export const dashboardService = {
  getMetrics: (signal?: AbortSignal) =>
    apiRequest<DashboardMetricsResponse>("/dashboard/metrics", { signal }),
  getAnalytics: (days = 30, signal?: AbortSignal) =>
    apiRequest<DashboardAnalyticsResponse>(`/dashboard/analytics?days=${days}`, { signal }),
};

export function useDashboardMetrics() {
  return useQuery({
    queryKey: ["dashboard", "metrics"],
    queryFn: ({ signal }) => dashboardService.getMetrics(signal),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchInterval: false,
    refetchIntervalInBackground: false,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 3000),
    placeholderData: (prev) => prev,
  });
}

export function useDashboardAnalytics(days = 30) {
  return useQuery({
    queryKey: ["dashboard", "analytics", days],
    queryFn: ({ signal }) => dashboardService.getAnalytics(days, signal),
    staleTime: 300_000,
    gcTime: 10 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchInterval: false,
    refetchIntervalInBackground: false,
    retry: 1,
  });
}
