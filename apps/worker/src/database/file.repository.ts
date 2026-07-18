import type { FileEntity, FileVisibility, FileWithAccount } from "@nqdrive/types";
import { slugifyFilename, generatePublicId, PUBLIC_ID_PREFIXES } from "@nqdrive/shared";

interface FileRow {
  id: number;
  public_id?: string | null;
  filename: string;
  slug: string;
  provider_file_id: string;
  drive_account_id: number;
  folder_id: number | null;
  size_bytes: number;
  mime_type: string;
  visibility: string;
  download_count: number;
  share_code: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  original_folder_id: number | null;
}

interface FileWithAccountRow extends FileRow {
  drive_account_email: string;
  drive_account_provider: string;
  drive_account_public_id?: string | null;
  folder_public_id?: string | null;
}

type FileWithPublicId = FileEntity & {
  publicId?: string | null;
  fileId: string;
  accountId: string;
  folderPublicId?: string | null;
  driveAccountPublicId?: string | null;
  folderIdNumeric?: number | null;
};

function rowToFile(row: FileRow): FileWithPublicId {
  const fileId = row.public_id ?? "";
  const folderPublicId = (row as any).folder_public_id ?? null;
  const driveAccountPublicId = (row as any).drive_account_public_id ?? "";
  return {
    id: row.id,
    fileId,
    publicId: row.public_id ?? null,
    filename: row.filename,
    slug: row.slug,
    providerFileId: row.provider_file_id,
    driveAccountId: row.drive_account_id,
    accountId: driveAccountPublicId || "",
    folderId: folderPublicId,
    folderIdNumeric: row.folder_id,
    folderPublicId,
    driveAccountPublicId: driveAccountPublicId || null,
    sizeBytes: row.size_bytes,
    mimeType: row.mime_type,
    visibility: row.visibility as FileVisibility,
    downloadCount: row.download_count,
    shareCode: row.share_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
    originalFolderId: row.original_folder_id != null ? String(row.original_folder_id) : undefined,
  } as FileWithPublicId;
}

function rowToFileWithAccount(row: FileWithAccountRow): FileWithAccount & FileWithPublicId {
  const fileId = row.public_id ?? "";
  const base = rowToFile(row);
  const driveAccountPublicId = row.drive_account_public_id ?? "";
  const folderPublicId = (row as any).folder_public_id ?? null;
  const originalFolderPublicId = (row as any).original_folder_public_id ?? null;
  return {
    ...base,
    id: row.id,
    fileId,
    publicId: row.public_id ?? null,
    accountId: driveAccountPublicId || base.accountId || "",
    folderId: folderPublicId,
    folderIdNumeric: row.folder_id,
    folderPublicId,
    originalFolderId: originalFolderPublicId ?? (row.original_folder_id != null ? String(row.original_folder_id) : undefined),
    originalFolderPublicId: originalFolderPublicId ?? null,
    driveAccountPublicId: driveAccountPublicId || null,
    driveAccountEmail: row.drive_account_email,
    driveAccountProvider: row.drive_account_provider,
  } as FileWithAccount & FileWithPublicId;
}

export interface ListFilesParams {
  page: number;
  pageSize: number;
  search?: string;
  folderId?: number;
  folderPublicId?: string;
  visibility?: FileVisibility;
}

function genFilePublicId(): string {
  return generatePublicId(PUBLIC_ID_PREFIXES.file);
}

export class FileRepository {
  constructor(private readonly db: D1Database) {}

  /**
   * Paginated, searchable, filterable file listing for the dashboard's Files page.
   * Joins drive_accounts to surface which account a file lives on without a second round-trip.
   * Hanya menampilkan file yang TIDAK di-trash (deleted_at IS NULL).
   */
  async list(params: ListFilesParams): Promise<{ items: FileWithAccount[]; totalItems: number }> {
    const conditions: string[] = ["f.deleted_at IS NULL"];
    const bindings: unknown[] = [];

    if (params.search) {
      conditions.push("f.filename LIKE ?");
      bindings.push(`%${params.search}%`);
    }
    if (params.folderId !== undefined) {
      if (params.folderId === 0 || params.folderId === null) {
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

    const whereClause = `WHERE ${conditions.join(" AND ")}`;
    const offset = (params.page - 1) * params.pageSize;

    const countRow = await this.db
      .prepare(`SELECT COUNT(*) as count FROM files f ${whereClause}`)
      .bind(...bindings)
      .first<{ count: number }>();

    const { results } = await this.db
      .prepare(
        `SELECT f.*, d.email as drive_account_email, d.provider as drive_account_provider, d.public_id as drive_account_public_id,
                fld.public_id as folder_public_id
         FROM files f
         JOIN drive_accounts d ON d.id = f.drive_account_id
         LEFT JOIN folders fld ON fld.id = f.folder_id
         ${whereClause}
         ORDER BY f.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(...bindings, params.pageSize, offset)
      .all<FileWithAccountRow & { folder_public_id?: string | null }>();

    return {
      items: results.map(rowToFileWithAccount),
      totalItems: countRow?.count ?? 0,
    };
  }

  async findById(id: number): Promise<FileWithPublicId | null> {
    const row = await this.db
      .prepare("SELECT * FROM files WHERE id = ? AND deleted_at IS NULL")
      .bind(id)
      .first<FileRow>();
    return row ? rowToFile(row) : null;
  }

  async findByPublicId(publicId: string): Promise<FileWithPublicId | null> {
    const row = await this.db
      .prepare("SELECT * FROM files WHERE public_id = ? AND deleted_at IS NULL")
      .bind(publicId)
      .first<FileRow>();
    return row ? rowToFile(row) : null;
  }

  async findByPublicIdOrId(input: string | number): Promise<FileWithPublicId | null> {
    if (typeof input === "number" || /^\d+$/.test(String(input))) {
      const num = Number(input);
      if (!isNaN(num)) {
        const byId = await this.findById(num);
        if (byId) return byId;
      }
    }
    if (typeof input === "string" && input.startsWith("fil_")) {
      const byPub = await this.findByPublicId(input);
      if (byPub) return byPub;
    }
    if (typeof input === "string") {
      const byPub = await this.findByPublicId(input);
      if (byPub) return byPub;
      const num = Number(input);
      if (!isNaN(num)) return this.findById(num);
    }
    return null;
  }

  /** Untuk keperluan Trash restore/delete — mencari file meski sudah di-trash. */
  async findByIdIncludingTrashed(id: number): Promise<FileWithPublicId | null> {
    const row = await this.db
      .prepare("SELECT * FROM files WHERE id = ?")
      .bind(id)
      .first<FileRow>();
    return row ? rowToFile(row) : null;
  }

  async findByPublicIdIncludingTrashed(publicId: string): Promise<FileWithPublicId | null> {
    const row = await this.db
      .prepare("SELECT * FROM files WHERE public_id = ?")
      .bind(publicId)
      .first<FileRow>();
    return row ? rowToFile(row) : null;
  }

  async findByPublicIdOrIdIncludingTrashed(input: string | number): Promise<FileWithPublicId | null> {
    if (typeof input === "number" || /^\d+$/.test(String(input))) {
      const num = Number(input);
      if (!isNaN(num)) {
        const byId = await this.findByIdIncludingTrashed(num);
        if (byId) return byId;
      }
    }
    if (typeof input === "string" && input.startsWith("fil_")) {
      const byPub = await this.findByPublicIdIncludingTrashed(input);
      if (byPub) return byPub;
    }
    if (typeof input === "string") {
      const byPub = await this.findByPublicIdIncludingTrashed(input);
      if (byPub) return byPub;
      const num = Number(input);
      if (!isNaN(num)) return this.findByIdIncludingTrashed(num);
    }
    return null;
  }

  async findBySlug(slug: string): Promise<FileWithPublicId | null> {
    const row = await this.db
      .prepare("SELECT * FROM files WHERE slug = ? AND deleted_at IS NULL")
      .bind(slug)
      .first<FileRow>();
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
    shareCode: string;
    publicId?: string;
  }): Promise<FileWithPublicId> {
    const publicId = params.publicId ?? genFilePublicId();
    const row = await this.db
      .prepare(
        `INSERT INTO files (
           public_id, filename, slug, provider_file_id, drive_account_id, folder_id,
           size_bytes, mime_type, visibility, share_code
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING *`
      )
      .bind(
        publicId,
        params.filename,
        params.slug,
        params.providerFileId,
        params.driveAccountId,
        params.folderId,
        params.sizeBytes,
        params.mimeType,
        params.visibility,
        params.shareCode,
      )
      .first<FileRow>();

    if (!row) throw new Error("Failed to create file: no row returned");
    return rowToFile(row);
  }

  async rename(id: number, filename: string): Promise<void> {
    await this.db
      .prepare("UPDATE files SET filename = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL")
      .bind(filename, id)
      .run();
  }

  async updateVisibility(id: number, visibility: FileVisibility): Promise<void> {
    await this.db
      .prepare("UPDATE files SET visibility = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL")
      .bind(visibility, id)
      .run();
  }

  async incrementDownloadCount(id: number): Promise<void> {
    await this.db
      .prepare("UPDATE files SET download_count = download_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(id)
      .run();
  }

  /**
   * Soft delete: pindahkan file ke Trash.
   * - Set deleted_at = sekarang
   * - Simpan original_folder_id agar bisa di-restore
   * - Jika file berstatus public → otomatis ganti ke private (keamanan)
   */
  async softDelete(id: number): Promise<void> {
    await this.db
      .prepare(
        `UPDATE files
         SET deleted_at = CURRENT_TIMESTAMP,
             original_folder_id = folder_id,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND deleted_at IS NULL`
      )
      .bind(id)
      .run();
  }

  /**
   * Soft delete untuk semua file dalam sebuah folder (saat folder di-trash).
   * File-file tersebut akan masuk Trash bersama foldernya.
   */
  async softDeleteByFolderId(folderId: number): Promise<void> {
    await this.db
      .prepare(
        `UPDATE files
         SET deleted_at = CURRENT_TIMESTAMP,
             original_folder_id = folder_id,
             updated_at = CURRENT_TIMESTAMP
         WHERE folder_id = ? AND deleted_at IS NULL`
      )
      .bind(folderId)
      .run();
  }

  /** Restore file dari Trash — kembalikan ke folder asal. */
  async restore(id: number): Promise<void> {
    await this.db
      .prepare(
        `UPDATE files
         SET deleted_at = NULL,
             folder_id = original_folder_id,
             original_folder_id = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(id)
      .run();
  }

  /** Hapus permanen dari DB (setelah file fisik di Google Drive sudah dihapus). */
  async delete(id: number): Promise<void> {
    await this.db.prepare("DELETE FROM files WHERE id = ?").bind(id).run();
  }

  /**
   * Pindahkan record file ke akun drive lain (dipakai fitur migrasi antar akun).
   * Dipanggil SETELAH copy di provider sukses, SEBELUM file sumber dihapus �
   * sehingga download tidak pernah menunjuk lokasi yang sudah tidak ada.
   */
  async updateProviderLocation(
    id: number,
    driveAccountId: number,
    providerFileId: string
  ): Promise<void> {
    await this.db
      .prepare(
        `UPDATE files
         SET drive_account_id = ?, provider_file_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(driveAccountId, providerFileId, id)
      .run();
  }

  /**
   * List semua file yang sedang di Trash (deleted_at IS NOT NULL).
   * Digunakan untuk halaman Trash dashboard.
   */
  async listTrashed(): Promise<FileWithAccount[]> {
    const { results } = await this.db
      .prepare(
        `SELECT f.*, d.email as drive_account_email, d.provider as drive_account_provider, d.public_id as drive_account_public_id,
                fld.public_id as folder_public_id, ofld.public_id as original_folder_public_id
         FROM files f
         JOIN drive_accounts d ON d.id = f.drive_account_id
         LEFT JOIN folders fld ON fld.id = f.folder_id
         LEFT JOIN folders ofld ON ofld.id = f.original_folder_id
         WHERE f.deleted_at IS NOT NULL
         ORDER BY f.deleted_at DESC`
      )
      .all<FileWithAccountRow & { original_folder_public_id?: string | null }>();
    return results.map(rowToFileWithAccount);
  }

  /**
   * Mengembalikan semua file yang sudah kadaluarsa di Trash (>= daysOld hari).
   * Digunakan oleh cron job auto-purge.
   */
  async findExpiredTrash(daysOld: number): Promise<FileEntity[]> {
    const { results } = await this.db
      .prepare(
        `SELECT * FROM files
         WHERE deleted_at IS NOT NULL
           AND deleted_at < datetime('now', '-' || ? || ' days')`
      )
      .bind(daysOld)
      .all<FileRow>();
    return results.map(rowToFile);
  }

  /** Used by the Storage Manager dashboard to show total file count. */
  async countAll(): Promise<number> {
    const row = await this.db
      .prepare("SELECT COUNT(*) as count FROM files WHERE deleted_at IS NULL")
      .first<{ count: number }>();
    return row?.count ?? 0;
  }

  /** Count trash items */
  async countTrashed(): Promise<number> {
    const row = await this.db
      .prepare("SELECT COUNT(*) as count FROM files WHERE deleted_at IS NOT NULL")
      .first<{ count: number }>();
    return row?.count ?? 0;
  }

  /** Used by the Storage Manager dashboard to show total download count across all files. */
  async sumDownloadCount(): Promise<number> {
    const row = await this.db
      .prepare("SELECT COALESCE(SUM(download_count), 0) as total FROM files WHERE deleted_at IS NULL")
      .first<{ total: number }>();
    return row?.total ?? 0;
  }

  /**
   * FIX: Update sizeBytes untuk file yang tersimpan dengan ukuran 0/salah.
   * Dipanggil oleh DownloadService saat mendeteksi sizeBytes = 0 di DB
   * dan berhasil mendapatkan ukuran yang benar dari Google Drive API.
   */
  async updateSizeBytes(id: number, sizeBytes: number): Promise<void> {
    await this.db
      .prepare("UPDATE files SET size_bytes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND size_bytes = 0")
      .bind(sizeBytes, id)
      .run();
  }

  async getTopDownloaded(limit: number): Promise<FileEntity[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM files WHERE deleted_at IS NULL ORDER BY download_count DESC LIMIT ?")
      .bind(limit)
      .all<FileRow>();
    return results.map(rowToFile);
  }

  async getRecent(limit: number): Promise<FileEntity[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM files WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ?")
      .bind(limit)
      .all<FileRow>();
    return results.map(rowToFile);
  }
  /**
   * List semua file langsung dalam folder (untuk listing folder public).
   * TIDAK memfilter visibility - akses ditentukan oleh status public foldernya.
   */
  async listByFolderId(folderId: number): Promise<FileEntity[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM files WHERE folder_id = ? AND deleted_at IS NULL ORDER BY filename ASC")
      .bind(folderId)
      .all<FileRow>();
    return results.map(rowToFile);
  }

  /**
   * Cari satu file berdasarkan folder + nama file (untuk download folder public).
   * TIDAK memfilter visibility - akses ditentukan oleh status public foldernya.
   * Limitasi: kalau ada nama file duplikat dalam satu folder, ambil yang paling lama dibuat.
   */
  async findByFolderIdAndFilename(folderId: number, filename: string): Promise<FileEntity | null> {
    const row = await this.db
      .prepare("SELECT * FROM files WHERE folder_id = ? AND filename = ? AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1")
      .bind(folderId, filename)
      .first<FileRow>();
    return row ? rowToFile(row) : null;
  }
  /**
   * Cari file dalam folder berdasarkan SLUG nama file (untuk download folder public).
   * Membandingkan slugifyFilename(filename) dengan slug dari URL.
   * TIDAK memfilter visibility - akses ditentukan oleh status public foldernya.
   * Limitasi: kalau ada slug duplikat dalam satu folder, ambil yang paling lama dibuat.
   */
  async findByFolderIdAndSlug(folderId: number, slug: string): Promise<FileEntity | null> {
    const { results } = await this.db
      .prepare("SELECT * FROM files WHERE folder_id = ? AND deleted_at IS NULL ORDER BY created_at ASC")
      .bind(folderId)
      .all<FileRow>();

    const match = results.find((r) => slugifyFilename(r.filename) === slug);
    return match ? rowToFile(match) : null;
  }
}
