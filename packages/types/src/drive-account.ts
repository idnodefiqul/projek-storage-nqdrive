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
  | "minio"
  | "telegram";

export type DriveAccountStatus = "online" | "offline" | "error" | "syncing";

/**
 * Represents a connected storage account — professional ID acc_xxx
 * id numeric internal, accountId public
 */
export interface DriveAccount {
  /** Internal numeric ID — internal only, not exposed in public API responses (toPublic strips it) */
  id: number;
  /** Professional account ID: acc_xxx — public API */
  accountId: string;
  email: string;
  provider: StorageProviderType;
  refreshTokenEncrypted: string;
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
