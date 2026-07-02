/**
 * Supported storage provider identifiers.
 * Modular by design: new providers can be added without changing existing code (Open/Closed Principle).
 */
export type StorageProviderType =
  | "google_drive"
  | "cloudflare_r2"
  | "amazon_s3"
  | "backblaze_b2"
  | "wasabi"
  | "dropbox"
  | "onedrive"
  | "minio";

export type DriveAccountStatus = "online" | "offline" | "error" | "syncing";

/**
 * Represents a connected storage account (e.g. one Google Drive account).
 * Multiple accounts of possibly different providers form the unified virtual storage pool.
 */
export interface DriveAccount {
  id: number;
  email: string;
  provider: StorageProviderType;
  /** Encrypted at rest. Never expose to the client. */
  refreshTokenEncrypted: string;
  /** Short-lived, refreshed automatically by the worker cron job. Never persisted in plaintext logs. */
  accessToken: string | null;
  accessTokenExpiresAt: string | null;
  totalStorageBytes: number;
  usedStorageBytes: number;
  availableStorageBytes: number;
  status: DriveAccountStatus;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PublicDriveAccount = Omit<
  DriveAccount,
  "refreshTokenEncrypted" | "accessToken" | "accessTokenExpiresAt"
>;
