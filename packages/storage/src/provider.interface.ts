import type { StorageProviderType } from "@nqdrive/types";

/**
 * Result of a quota check against a provider account.
 * Used by the auto-select logic to pick the account with the most free space.
 */
export interface StorageQuota {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
}

/**
 * Metadata returned by a provider after a file has been uploaded.
 */
export interface ProviderUploadResult {
  providerFileId: string;
  sizeBytes: number;
  mimeType: string;
}

/**
 * A single chunk of file data plus progress info, used to stream upload progress
 * back to the client in real time (percentage, speed, ETA).
 */
export interface UploadProgressEvent {
  uploadedBytes: number;
  totalBytes: number;
  percentage: number;
  speedBytesPerSecond: number;
  etaSeconds: number;
}

export type UploadProgressCallback = (event: UploadProgressEvent) => void;

/**
 * Credentials required by a provider to act on behalf of a connected account.
 * Shape intentionally generic (string key-value) since each provider needs different fields
 * (e.g. Google Drive needs an access token, S3-compatible providers need access/secret keys).
 */
export type ProviderCredentials = Record<string, string>;

/**
 * The StorageProvider interface is the single contract every storage backend must implement.
 *
 * Design rationale (Open/Closed Principle):
 * Adding a new provider (R2, S3, B2, Wasabi, Dropbox, OneDrive, MinIO) never requires touching
 * existing code — it only requires a new class implementing this interface, plus registration
 * in the provider factory. The rest of the application (upload service, download streaming,
 * storage manager dashboard) only ever depends on this interface, never on a concrete provider.
 */
export interface StorageProvider {
  readonly type: StorageProviderType;

  /**
   * Uploads a file stream to the provider, reporting progress along the way.
   * Must support large files via streaming (never buffer the entire file in memory).
   */
  upload(params: {
    credentials: ProviderCredentials;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    stream: ReadableStream<Uint8Array>;
    onProgress?: UploadProgressCallback;
  }): Promise<ProviderUploadResult>;

  /**
   * Returns a readable stream of the file's content, optionally starting at a byte offset
   * (required for HTTP Range support / resumable downloads).
   */
  download(params: {
    credentials: ProviderCredentials;
    providerFileId: string;
    rangeStart?: number;
    rangeEnd?: number;
  }): Promise<{
    stream: ReadableStream<Uint8Array>;
    sizeBytes: number;
    mimeType: string;
    /** Content-Range header dari provider (misal: "bytes 0-149999999/150000000").
     *  Selalu ada karena kita memaksa Range: bytes=0- ke Google Drive.
     *  Gunakan ini sebagai sumber kebenaran ukuran file — lebih akurat dari DB. */
    contentRange: string | null;
    /** Content-Length aktual yang dikembalikan provider untuk chunk ini. */
    contentLength: number | null;
  }>;

  /** Permanently deletes a file from the provider. */
  delete(params: { credentials: ProviderCredentials; providerFileId: string }): Promise<void>;

  /** Fetches current quota (total/used/available) for the connected account. */
  getQuota(params: { credentials: ProviderCredentials }): Promise<StorageQuota>;

  /**
   * Exchanges a refresh token for a fresh access token.
   * Called automatically by the worker's scheduled cron job before the current token expires.
   */
  refreshAccessToken(params: {
    refreshToken: string;
  }): Promise<{ accessToken: string; expiresAt: string }>;
}
