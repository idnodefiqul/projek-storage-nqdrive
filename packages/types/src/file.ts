export type FileVisibility = "public" | "private" | "hidden";

/**
 * Represents a single file stored in the virtual storage pool.
 * The actual binary content lives in one of the connected drive accounts;
 * this row is the unified metadata record.
 */
export interface FileEntity {
  /** Internal numeric ID — still present for internal DB ops, but not exposed in public API responses */
  id: number;
  /** Professional file ID: fil_xxx — public API */
  fileId: string;
  filename: string;
  /** URL-safe unique identifier used for public download links */
  slug: string;
  /** 23-char random string to protect direct download links */
  shareCode: string;
  /** Provider file ID */
  providerFileId: string;
  /** Professional account ID: acc_xxx — public API */
  accountId: string;
  /** Internal legacy numeric driveAccountId — internal only, not exposed */
  driveAccountId: number;
  /** Professional folder ID: fld_xxx or null for root — public API */
  folderId: string | null;
  /** Internal numeric folderId — internal only */
  folderIdNumeric?: number | null;
  sizeBytes: number;
  mimeType: string;
  visibility: FileVisibility;
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  originalFolderId?: string | null;
}

export interface Folder {
  /** Internal numeric ID — internal only */
  id: number;
  /** Professional folder ID: fld_xxx — public API */
  folderId: string;
  name: string;
  /** Professional parent folder ID: fld_xxx or null */
  parentFolderId: string | null;
  shareUuid?: string | null;
  sizeBytes?: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  originalParentFolderId?: string | null;
}

/** Response from /api/folders/by-path */
export interface FolderByPathResponse {
  /** The resolved folder, or null if at root */
  folder: Folder | null;
  /** Professional folder ID: fld_xxx or null for root */
  folderId: string | null;
  /** Ordered ancestor chain: [root, ..., direct parent] — used for breadcrumb */
  ancestors: Folder[];
  /** Direct children folders inside the resolved path */
  children: Folder[];
}

/** A file row enriched with the drive account it lives on — useful for dashboard tables. */
export interface FileWithAccount extends FileEntity {
  driveAccountEmail: string;
  /** Provider type (google_drive, dropbox, dll) — dipakai frontend untuk ikon badge. */
  driveAccountProvider?: string;
}

/** Response from /api/trash — list semua item di Trash */
export interface TrashResponse {
  files: FileWithAccount[];
  folders: Folder[];
  totalItems: number;
}
