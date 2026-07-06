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
  email: string;
  usedStorageBytes: number;
  totalStorageBytes: number;
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
  getMetrics: () => apiRequest<DashboardMetricsResponse>("/dashboard/metrics"),
  getAnalytics: (days = 30) =>
    apiRequest<DashboardAnalyticsResponse>(`/dashboard/analytics?days=${days}`),
};

export function useDashboardMetrics() {
  return useQuery({
    queryKey: ["dashboard", "metrics"],
    queryFn: dashboardService.getMetrics,
    staleTime: 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
}

export function useDashboardAnalytics(days = 30) {
  return useQuery({
    queryKey: ["dashboard", "analytics", days],
    queryFn: () => dashboardService.getAnalytics(days),
    staleTime: 300_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
}
