import type { ApiKey } from "@nqdrive/types";

interface ApiKeyRow {
  id: number;
  name: string;
  key_hash: string;
  key_prefix: string;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

function rowToApiKey(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    name: row.name,
    keyHash: row.key_hash,
    keyPrefix: row.key_prefix,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  };
}

export class ApiKeyRepository {
  constructor(private readonly db: D1Database) {}

  async findAll(): Promise<ApiKey[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM api_keys ORDER BY created_at DESC")
      .all<ApiKeyRow>();
    return results.map(rowToApiKey);
  }

  // SECURITY FIX #15 (lanjutan): tambah findByHash agar middleware bisa lookup
  // API key dari hash tanpa pernah menyimpan/mengirim key asli.
  async findByHash(keyHash: string): Promise<ApiKey | null> {
    const row = await this.db
      .prepare("SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL")
      .bind(keyHash)
      .first<ApiKeyRow>();
    return row ? rowToApiKey(row) : null;
  }

  async create(params: { name: string; keyHash: string; keyPrefix: string }): Promise<ApiKey> {
    const row = await this.db
      .prepare("INSERT INTO api_keys (name, key_hash, key_prefix) VALUES (?, ?, ?) RETURNING *")
      .bind(params.name, params.keyHash, params.keyPrefix)
      .first<ApiKeyRow>();

    if (!row) throw new Error("Failed to create API key: no row returned");
    return rowToApiKey(row);
  }

  async revoke(id: number): Promise<void> {
    await this.db.prepare("UPDATE api_keys SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
  }

  // SECURITY FIX #15 (lanjutan): update last_used_at untuk audit trail
  async updateLastUsed(id: number): Promise<void> {
    await this.db
      .prepare("UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(id)
      .run();
  }
}
