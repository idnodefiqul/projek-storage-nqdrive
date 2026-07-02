import { apiRequest } from "../lib/client";

export interface UploadLogEntry {
  id: number;
  filename: string;
  size_bytes: number;
  status: string;
  duration_ms: number;
  error_message: string | null;
  created_at: string;
}

export interface DownloadLogEntry {
  id: number;
  file_id: number | null;
  filename: string | null;
  ip_address: string;
  country: string | null;
  bytes_served: number;
  status: string;
  created_at: string;
}

export const logService = {
  listUploads: () => apiRequest<{ logs: UploadLogEntry[] }>("/logs/uploads"),
  listDownloads: () => apiRequest<{ logs: DownloadLogEntry[] }>("/logs/downloads"),
};
