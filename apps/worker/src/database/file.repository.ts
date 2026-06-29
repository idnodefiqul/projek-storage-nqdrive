import type { FileEntity, FileVisibility, FileWithAccount } from "@nqdrive/types";

interface FileRow {
  id: number;
  filename: string;
  slug: string;
  provider_file_id: string;
  drive_account_id: number;
  folder_id: number | null;
  size_bytes: number;
  mime_type: string;
  visibility: string;
  download_count: number;
  created_at: string;
  updated_at: string;
}

interface FileWithAccountRow extends FileRow {
  drive_account_email: string;
}

function rowToFile(row: FileRow): FileEntity {
  return {
    id: row.id,
    filename: row.filename,
    slug: row.slug,
    providerFileId: row.provider_file_id,
    driveAccountId: row.drive_account_id,
    folderId: row.folder_id,
    sizeBytes: row.size_bytes,
    mimeType: row.mime_type,
    visibility: row.visibility as FileVisibility,
    downloadCount: row.download_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToFileWithAccount(row: FileWithAccountRow): FileWithAccount {
  return { ...rowToFile(row), driveAccountEmail: row.drive_account_email };
}

export interface ListFilesParams {
  page: number;
  pageSize: number;
  search?: string;
  folderId?: number;
  visibility?: FileVisibility;
}

export class FileRepository {
  constructor(private readonly db: D1Database) {}

  /**
   * Paginated, searchable, filterable file listing for the dashboard's Files page.
   * Joins drive_accounts to surface which account a file lives on without a second round-trip.
   */
  async list(params: ListFilesParams): Promise<{ items: FileWithAccount[]; totalItems: number }> {
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (params.search) {
      conditions.push("f.filename LIKE ?");
      bindings.push(`%${params.search}%`);
    }
    if (params.folderId !== undefined) {
      if (params.folderId === 0) {
        conditions.push("f.folder_id IS NULL");
      } else {
        conditions.push("f.folder_id = ?");
        bindings.push(params.folderId);
      }
    }
    if (params.visibility) {
      conditions.push("f.visibility = ?");
      bindings.push(params.visibility);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (params.page - 1) * params.pageSize;

    const countRow = await this.db
      .prepare(`SELECT COUNT(*) as count FROM files f ${whereClause}`)
      .bind(...bindings)
      .first<{ count: number }>();

    const { results } = await this.db
      .prepare(
        `SELECT f.*, d.email as drive_account_email
         FROM files f
         JOIN drive_accounts d ON d.id = f.drive_account_id
         ${whereClause}
         ORDER BY f.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(...bindings, params.pageSize, offset)
      .all<FileWithAccountRow>();

    return {
      items: results.map(rowToFileWithAccount),
      totalItems: countRow?.count ?? 0,
    };
  }

  async findById(id: number): Promise<FileEntity | null> {
    const row = await this.db.prepare("SELECT * FROM files WHERE id = ?").bind(id).first<FileRow>();
    return row ? rowToFile(row) : null;
  }

  async findBySlug(slug: string): Promise<FileEntity | null> {
    const row = await this.db.prepare("SELECT * FROM files WHERE slug = ?").bind(slug).first<FileRow>();
    return row ? rowToFile(row) : null;
  }

  async create(params: {
    filename: string;
    slug: string;
    providerFileId: string;
    driveAccountId: number;
    folderId: number | null;
    sizeBytes: number;
    mimeType: string;
    visibility: FileVisibility;
  }): Promise<FileEntity> {
    const row = await this.db
      .prepare(
        `INSERT INTO files (
           filename, slug, provider_file_id, drive_account_id, folder_id,
           size_bytes, mime_type, visibility
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING *`
      )
      .bind(
        params.filename,
        params.slug,
        params.providerFileId,
        params.driveAccountId,
        params.folderId,
        params.sizeBytes,
        params.mimeType,
        params.visibility
      )
      .first<FileRow>();

    if (!row) throw new Error("Failed to create file: no row returned");
    return rowToFile(row);
  }

  async rename(id: number, filename: string): Promise<void> {
    await this.db
      .prepare("UPDATE files SET filename = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(filename, id)
      .run();
  }

  async updateVisibility(id: number, visibility: FileVisibility): Promise<void> {
    await this.db
      .prepare("UPDATE files SET visibility = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(visibility, id)
      .run();
  }

  async incrementDownloadCount(id: number): Promise<void> {
    await this.db
      .prepare("UPDATE files SET download_count = download_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(id)
      .run();
  }

  async delete(id: number): Promise<void> {
    await this.db.prepare("DELETE FROM files WHERE id = ?").bind(id).run();
  }

  /** Used by the Storage Manager dashboard to show total file count. */
  async countAll(): Promise<number> {
    const row = await this.db.prepare("SELECT COUNT(*) as count FROM files").first<{ count: number }>();
    return row?.count ?? 0;
  }

  /** Used by the Storage Manager dashboard to show total download count across all files. */
  async sumDownloadCount(): Promise<number> {
    const row = await this.db
      .prepare("SELECT COALESCE(SUM(download_count), 0) as total FROM files")
      .first<{ total: number }>();
    return row?.total ?? 0;
  }
}
