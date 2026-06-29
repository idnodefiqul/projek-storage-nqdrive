/** Maximum upload chunk size for resumable uploads (8 MB). */
export const UPLOAD_CHUNK_SIZE_BYTES = 8 * 1024 * 1024;

/** Maximum single file size accepted by NQDRIVE (15 GB, Google Drive's per-file practical ceiling). */
export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024 * 1024;

/** Default pagination page size across dashboard tables. */
export const DEFAULT_PAGE_SIZE = 20;

/** JWT session cookie name. */
export const SESSION_COOKIE_NAME = "nqdrive_session";

/** JWT access token lifetime in seconds (24 hours). */
export const JWT_EXPIRY_SECONDS = 60 * 60 * 24;

export const FILE_VISIBILITY_OPTIONS = ["public", "private", "hidden"] as const;

export const STORAGE_PROVIDER_OPTIONS = [
  "google_drive",
  "cloudflare_r2",
  "amazon_s3",
  "backblaze_b2",
  "wasabi",
  "dropbox",
  "onedrive",
  "minio",
] as const;
