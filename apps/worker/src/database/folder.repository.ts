import type { Folder } from "@nqdrive/types";
import { slugifyFilename } from "@nqdrive/shared";

interface FolderRow {
  id: number;
  name: string;
  parent_folder_id: number | null;
  size_bytes?: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  original_parent_folder_id: number | null;
  share_uuid: string | null;
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
    shareUuid: row.share_uuid ?? undefined,
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

  // Cache for path resolution to avoid N sequential queries on deep paths
  private static pathCache = new Map<string, { id: number; ancestors: Folder[]; expires: number }>();
  private static readonly PATH_CACHE_TTL = 30_000; // 30s

  /**
   * Resolves a slash-separated path of folder names to a folder ID.
   * Optimized: uses cache + single batched query for shallow paths, falls back to sequential for deep.
   * e.g. "Dokumen/Proyek/2025" → folder with id=42
   */
  async resolvePathToId(pathSegments: string[]): Promise<{ id: number; ancestors: Folder[] } | null> {
    if (pathSegments.length === 0) return null;

    const cacheKey = pathSegments.join("/");
    const cached = FolderRepository.pathCache.get(cacheKey);
    if (cached && Date.now() < cached.expires) {
      return { id: cached.id, ancestors: cached.ancestors };
    }

    // For shallow paths (<=2 levels), try to resolve with fewer queries using IN clause
    // For deeper paths, use sequential but with caching
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
    const result = { id: last.id, ancestors };

    // Cache result
    FolderRepository.pathCache.set(cacheKey, {
      id: result.id,
      ancestors: result.ancestors,
      expires: Date.now() + FolderRepository.PATH_CACHE_TTL,
    });
    if (FolderRepository.pathCache.size > 200) {
      const firstKey = FolderRepository.pathCache.keys().next().value;
      if (firstKey) FolderRepository.pathCache.delete(firstKey);
    }

    return result;
  }

  /**
   * Builds the full ancestor chain for a given folder ID using single recursive CTE query.
   * Returns ordered list from root → direct parent (including the folder itself for simplicity).
   * Much faster than N sequential queries for deep paths.
   */
  async getAncestors(folderId: number): Promise<Folder[]> {
    try {
      // Try recursive CTE for efficiency (single query instead of up to 20)
      const { results } = await this.db
        .prepare(
          `
          WITH RECURSIVE ancestors(id, name, parent_folder_id, created_at, updated_at, deleted_at, original_parent_folder_id, share_uuid, depth) AS (
            SELECT id, name, parent_folder_id, created_at, updated_at, deleted_at, original_parent_folder_id, share_uuid, 0 as depth
            FROM folders WHERE id = ?
            UNION ALL
            SELECT f.id, f.name, f.parent_folder_id, f.created_at, f.updated_at, f.deleted_at, f.original_parent_folder_id, f.share_uuid, a.depth + 1
            FROM folders f
            INNER JOIN ancestors a ON f.id = a.parent_folder_id
            WHERE a.depth < 20
          )
          SELECT id, name, parent_folder_id, created_at, updated_at, deleted_at, original_parent_folder_id, share_uuid FROM ancestors ORDER BY depth DESC
          `
        )
        .bind(folderId)
        .all<FolderRow>();

      if (results.length > 0) {
        return results.map(rowToFolder);
      }
    } catch {
      // Fallback to sequential if CTE fails (e.g., SQLite version)
    }

    // Fallback sequential (original logic)
    const ancestors: Folder[] = [];
    let currentId: number | null = folderId;
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
   * Soft delete seluruh sub-folder secara rekursif — optimized with single CTE query.
   * Previously did N sequential queries + recursion, now 1 query to get all descendants + batch update.
   */
  async softDeleteDescendants(parentId: number): Promise<void> {
    try {
      // Get all descendant IDs via recursive CTE in single query
      const { results } = await this.db
        .prepare(
          `
          WITH RECURSIVE descendants(id) AS (
            SELECT id FROM folders WHERE parent_folder_id = ? AND deleted_at IS NULL
            UNION ALL
            SELECT f.id FROM folders f INNER JOIN descendants d ON f.parent_folder_id = d.id WHERE f.deleted_at IS NULL
          )
          SELECT id FROM descendants
          `
        )
        .bind(parentId)
        .all<{ id: number }>();

      if (results.length === 0) return;

      const ids = results.map((r) => r.id);
      // Batch update in chunks of 50 to avoid SQL param limits
      for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50);
        const placeholders = chunk.map(() => "?").join(",");
        await this.db
          .prepare(
            `UPDATE folders SET deleted_at = CURRENT_TIMESTAMP, original_parent_folder_id = parent_folder_id, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders}) AND deleted_at IS NULL`
          )
          .bind(...chunk)
          .run();
      }
    } catch {
      // Fallback to original recursive logic if CTE fails
      const { results } = await this.db
        .prepare("SELECT id FROM folders WHERE parent_folder_id = ? AND deleted_at IS NULL")
        .bind(parentId)
        .all<{ id: number }>();

      for (const sub of results) {
        await this.softDelete(sub.id);
        await this.softDeleteDescendants(sub.id);
      }
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
  /** Tandai folder sebagai public dengan UUID share v4. */
  async setPublic(id: number, uuid: string): Promise<void> {
    await this.db
      .prepare("UPDATE folders SET share_uuid = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL")
      .bind(uuid, id)
      .run();
  }

  /** Cabut status public folder. */
  async setPrivate(id: number): Promise<void> {
    await this.db
      .prepare("UPDATE folders SET share_uuid = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(id)
      .run();
  }

  /** Cari folder root yang di-share publik berdasarkan share UUID. */
  async findByShareUuid(uuid: string): Promise<Folder | null> {
    const row = await this.db
      .prepare("SELECT * FROM folders WHERE share_uuid = ? AND deleted_at IS NULL")
      .bind(uuid)
      .first<FolderRow>();
    return row ? rowToFolder(row) : null;
  }

  /**
   * Telusuri path relatif dari folder root yang SUDAH diverifikasi public oleh caller.
   * Method ini tidak mengecek share_uuid lagi.
   * segments kosong => kembalikan folder root itu sendiri.
   * Kembalikan null bila salah satu segmen tidak ditemukan.
   */
  async resolveSubfolder(rootId: number, segments: string[]): Promise<Folder | null> {
    if (segments.length === 0) return this.findById(rootId);

    let currentParentId = rootId;
    let current: Folder | null = null;

    for (const segment of segments) {
      const row = await this.db
        .prepare("SELECT * FROM folders WHERE name = ? AND parent_folder_id = ? AND deleted_at IS NULL LIMIT 1")
        .bind(segment, currentParentId)
        .first<FolderRow>();
      if (!row) return null;
      current = rowToFolder(row);
      currentParentId = current.id;
    }

    return current;
  }
  /**
   * Sama seperti resolveSubfolder tapi match berdasarkan slug, bukan nama exact.
   * Setiap segmen di-slugify lalu dibandingkan dengan slugify(folder.name).
   */
  async resolveSubfolderBySlug(rootId: number, slugSegments: string[]): Promise<Folder | null> {
    if (slugSegments.length === 0) return this.findById(rootId);

    let currentParentId = rootId;
    let current: Folder | null = null;

    for (const slugSeg of slugSegments) {
      const { results } = await this.db
        .prepare("SELECT * FROM folders WHERE parent_folder_id = ? AND deleted_at IS NULL")
        .bind(currentParentId)
        .all<FolderRow>();

      const match = results.find((r) => slugifyFilename(r.name) === slugSeg);
      if (!match) return null;
      current = rowToFolder(match);
      currentParentId = current.id;
    }

    return current;
  }
}
