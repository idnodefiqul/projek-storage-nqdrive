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

/** A file row enriched with the drive account it lives on — useful for dashboard tables. */
export interface FileWithAccount extends FileEntity {
  driveAccountEmail: string;
}
