import type { Folder } from "@nqdrive/types";

interface FolderRow {
  id: number;
  name: string;
  parent_folder_id: number | null;
  size_bytes?: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  original_parent_folder_id: number | null;
}

function rowToFolder(row: FolderRow): Folder {
  return {
    id: row.id,
    name: row.name,
    parentFolderId: row.parent_folder_id,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
    originalParentFolderId: row.original_parent_folder_id ?? undefined,
  };
}

export class FolderRepository {
  constructor(private readonly db: D1Database) {}

  /**
   * Lists folders directly under the given parent (or root folders when parentFolderId is null).
   * Hanya menampilkan folder yang TIDAK di-trash (deleted_at IS NULL).
   */
  async findByParent(parentFolderId: number | null): Promise<Folder[]> {
    const query =
      parentFolderId === null
        ? `SELECT f.*, (SELECT SUM(size_bytes) FROM files WHERE folder_id = f.id AND deleted_at IS NULL) as size_bytes
           FROM folders f WHERE f.parent_folder_id IS NULL AND f.deleted_at IS NULL ORDER BY f.name ASC`
        : `SELECT f.*, (SELECT SUM(size_bytes) FROM files WHERE folder_id = f.id AND deleted_at IS NULL) as size_bytes
           FROM folders f WHERE f.parent_folder_id = ? AND f.deleted_at IS NULL ORDER BY f.name ASC`;

    const stmt = parentFolderId === null ? this.db.prepare(query) : this.db.prepare(query).bind(parentFolderId);
    const { results } = await stmt.all<FolderRow>();
    return results.map(rowToFolder);
  }

  async findById(id: number): Promise<Folder | null> {
    const row = await this.db
      .prepare("SELECT * FROM folders WHERE id = ? AND deleted_at IS NULL")
      .bind(id)
      .first<FolderRow>();
    return row ? rowToFolder(row) : null;
  }

  /** Untuk keperluan Trash restore/delete — mencari folder meski sudah di-trash. */
  async findByIdIncludingTrashed(id: number): Promise<Folder | null> {
    const row = await this.db
      .prepare("SELECT * FROM folders WHERE id = ?")
      .bind(id)
      .first<FolderRow>();
    return row ? rowToFolder(row) : null;
  }

  /**
   * Resolves a slash-separated path of folder names to a folder ID.
   * e.g. "Dokumen/Proyek/2025" → folder with id=42
   * Returns null if any segment in the path does not exist.
   * Hanya mencari folder aktif (deleted_at IS NULL).
   */
  async resolvePathToId(pathSegments: string[]): Promise<{ id: number; ancestors: Folder[] } | null> {
    if (pathSegments.length === 0) return null;

    let currentParentId: number | null = null;
    const ancestors: Folder[] = [];

    for (const segment of pathSegments) {
      const row = await this.db
        .prepare(
          currentParentId === null
            ? "SELECT * FROM folders WHERE name = ? AND parent_folder_id IS NULL AND deleted_at IS NULL LIMIT 1"
            : "SELECT * FROM folders WHERE name = ? AND parent_folder_id = ? AND deleted_at IS NULL LIMIT 1"
        )
        .bind(...(currentParentId === null ? [segment] : [segment, currentParentId]))
        .first<FolderRow>();

      if (!row) return null;
      const folder = rowToFolder(row);
      ancestors.push(folder);
      currentParentId = folder.id;
    }

    const last = ancestors[ancestors.length - 1];
    if (!last) return null;
    return { id: last.id, ancestors };
  }

  /**
   * Builds the full ancestor chain for a given folder ID.
   * Returns ordered list from root → direct parent (not including the folder itself).
   */
  async getAncestors(folderId: number): Promise<Folder[]> {
    const ancestors: Folder[] = [];
    let currentId: number | null = folderId;

    // Walk up via parent_folder_id (max 20 levels to prevent infinite loop on bad data)
    for (let i = 0; i < 20; i++) {
      if (currentId === null) break;
      const row: FolderRow | null = await this.db
        .prepare("SELECT * FROM folders WHERE id = ?")
        .bind(currentId)
        .first<FolderRow>();
      if (!row) break;
      ancestors.unshift(rowToFolder(row));
      currentId = row.parent_folder_id;
    }

    return ancestors;
  }

  async create(params: { name: string; parentFolderId: number | null }): Promise<Folder> {
    const row = await this.db
      .prepare("INSERT INTO folders (name, parent_folder_id) VALUES (?, ?) RETURNING *")
      .bind(params.name, params.parentFolderId)
      .first<FolderRow>();

    if (!row) throw new Error("Failed to create folder: no row returned");
    return rowToFolder(row);
  }

  async rename(id: number, name: string): Promise<void> {
    await this.db
      .prepare("UPDATE folders SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL")
      .bind(name, id)
      .run();
  }

  /**
   * Soft delete folder: pindahkan ke Trash.
   * - Set deleted_at = sekarang
   * - Simpan original_parent_folder_id untuk restore
   * - Sub-folder juga di-soft-delete (rekursif via helper)
   */
  async softDelete(id: number): Promise<void> {
    await this.db
      .prepare(
        `UPDATE folders
         SET deleted_at = CURRENT_TIMESTAMP,
             original_parent_folder_id = parent_folder_id,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND deleted_at IS NULL`
      )
      .bind(id)
      .run();
  }

  /**
   * Soft delete seluruh sub-folder secara rekursif.
   * Dipanggil dari trash.routes saat folder di-trash agar seluruh hierarchy ikut masuk trash.
   */
  async softDeleteDescendants(parentId: number): Promise<void> {
    // Cari semua sub-folder langsung
    const { results } = await this.db
      .prepare("SELECT id FROM folders WHERE parent_folder_id = ? AND deleted_at IS NULL")
      .bind(parentId)
      .all<{ id: number }>();

    for (const sub of results) {
      await this.softDelete(sub.id);
      await this.softDeleteDescendants(sub.id); // rekursif
    }
  }

  /**
   * List semua folder yang sedang di Trash (deleted_at IS NOT NULL).
   * Hanya menampilkan folder top-level trash (original_parent_folder_id = null atau folder parent tidak di-trash).
   */
  async listTrashed(): Promise<Folder[]> {
    const { results } = await this.db
      .prepare(
        `SELECT f.*
         FROM folders f
         WHERE f.deleted_at IS NOT NULL
         ORDER BY f.deleted_at DESC`
      )
      .all<FolderRow>();
    return results.map(rowToFolder);
  }

  /**
   * Restore folder dari Trash — kembalikan ke parent folder asal.
   */
  async restore(id: number): Promise<void> {
    await this.db
      .prepare(
        `UPDATE folders
         SET deleted_at = NULL,
             parent_folder_id = original_parent_folder_id,
             original_parent_folder_id = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(id)
      .run();
  }

  /**
   * Restore semua sub-folder yang ikut ter-trash bersama folder ini.
   */
  async restoreDescendants(parentId: number): Promise<void> {
    const { results } = await this.db
      .prepare("SELECT id FROM folders WHERE original_parent_folder_id = ? AND deleted_at IS NOT NULL")
      .bind(parentId)
      .all<{ id: number }>();

    for (const sub of results) {
      await this.restore(sub.id);
      await this.restoreDescendants(sub.id);
    }
  }

  /** Cascades to sub-folders automatically via the FK ON DELETE CASCADE defined in migrations. */
  async delete(id: number): Promise<void> {
    await this.db.prepare("DELETE FROM folders WHERE id = ?").bind(id).run();
  }

  async getRecent(limit: number): Promise<Folder[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM folders WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ?")
      .bind(limit)
      .all<FolderRow>();
    return results.map(rowToFolder);
  }

  /** Count folder trash items */
  async countTrashed(): Promise<number> {
    const row = await this.db
      .prepare("SELECT COUNT(*) as count FROM folders WHERE deleted_at IS NOT NULL")
      .first<{ count: number }>();
    return row?.count ?? 0;
  }
}
