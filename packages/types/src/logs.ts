export interface UploadLog {
  id: number;
  fileId: number | null;
  filename: string;
  sizeBytes: number;
  driveAccountId: number;
  /** Upload duration in milliseconds, used for speed analytics. */
  durationMs: number;
  status: "success" | "failed" | "cancelled";
  errorMessage: string | null;
  createdAt: string;
}

export interface DownloadLog {
  id: number;
  fileId: number;
  ipAddress: string;
  userAgent: string | null;
  bytesServed: number;
  status: "completed" | "partial" | "failed";
  createdAt: string;
}

export interface ApiKey {
  id: number;
  name: string;
  /** Hashed, never stored in plaintext. */
  keyHash: string;
  /** Only the prefix is stored in plaintext for identification in the UI, e.g. "nqd_live_a1b2". */
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}
