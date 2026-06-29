import type { Folder } from "@nqdrive/types";

interface FolderRow {
  id: number;
  name: string;
  parent_folder_id: number | null;
  size_bytes?: number;
  created_at: string;
  updated_at: string;
}

function rowToFolder(row: FolderRow): Folder {
  return {
    id: row.id,
    name: row.name,
    parentFolderId: row.parent_folder_id,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class FolderRepository {
  constructor(private readonly db: D1Database) {}

  /** Lists folders directly under the given parent (or root folders when parentFolderId is null). */
  async findByParent(parentFolderId: number | null): Promise<Folder[]> {
    const query =
      parentFolderId === null
        ? "SELECT f.*, (SELECT SUM(size_bytes) FROM files WHERE folder_id = f.id) as size_bytes FROM folders f WHERE f.parent_folder_id IS NULL ORDER BY f.name ASC"
        : "SELECT f.*, (SELECT SUM(size_bytes) FROM files WHERE folder_id = f.id) as size_bytes FROM folders f WHERE f.parent_folder_id = ? ORDER BY f.name ASC";

    const stmt = parentFolderId === null ? this.db.prepare(query) : this.db.prepare(query).bind(parentFolderId);
    const { results } = await stmt.all<FolderRow>();
    return results.map(rowToFolder);
  }

  async findById(id: number): Promise<Folder | null> {
    const row = await this.db.prepare("SELECT * FROM folders WHERE id = ?").bind(id).first<FolderRow>();
    return row ? rowToFolder(row) : null;
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
      .prepare("UPDATE folders SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(name, id)
      .run();
  }

  /** Cascades to sub-folders automatically via the FK ON DELETE CASCADE defined in migrations. */
  async delete(id: number): Promise<void> {
    await this.db.prepare("DELETE FROM folders WHERE id = ?").bind(id).run();
  }
}
