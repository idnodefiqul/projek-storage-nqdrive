export type FileVisibility = "public" | "private" | "hidden";

/**
 * Represents a single file stored in the virtual storage pool.
 * The actual binary content lives in one of the connected drive accounts;
 * this row is the unified metadata record.
 */
export interface FileEntity {
  id: number;
  filename: string;
  /** URL-safe unique identifier used for public download links, e.g. /windows11.gz */
  slug: string;
  /** The file ID as known by the underlying storage provider (e.g. Google Drive file id). */
  providerFileId: string;
  driveAccountId: number;
  folderId: number | null;
  sizeBytes: number;
  mimeType: string;
  visibility: FileVisibility;
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Folder {
  id: number;
  name: string;
  parentFolderId: number | null;
  sizeBytes?: number;
  createdAt: string;
  updatedAt: string;
}

/** Response from /api/folders/by-path */
export interface FolderByPathResponse {
  /** The resolved folder, or null if at root */
  folder: Folder | null;
  /** Integer ID for use in internal API calls (/api/files?folderId=...) */
  folderId: number | null;
  /** Ordered ancestor chain: [root, ..., direct parent] — used for breadcrumb */
  ancestors: Folder[];
  /** Direct children folders inside the resolved path */
  children: Folder[];
}

/** A file row enriched with the drive account it lives on — useful for dashboard tables. */
export interface FileWithAccount extends FileEntity {
  driveAccountEmail: string;
}
