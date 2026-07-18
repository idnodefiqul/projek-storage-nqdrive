export interface UploadLog {
  id?: number;
  logId: string;
  fileId: string | null;
  filename: string;
  sizeBytes: number;
  accountId: string;
  durationMs: number;
  status: "success" | "failed" | "cancelled";
  errorMessage: string | null;
  createdAt: string;
}

export interface DownloadLog {
  id?: number;
  logId: string;
  fileId: string;
  ipAddress: string;
  userAgent: string | null;
  bytesServed: number;
  status: "completed" | "partial" | "failed";
  createdAt: string;
}

export interface ApiKey {
  id?: number;
  apiKeyId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}
