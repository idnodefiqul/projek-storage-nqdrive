import type { ApiKey } from "@nqdrive/types";
import { generatePublicId, PUBLIC_ID_PREFIXES } from "@nqdrive/shared";

interface ApiKeyRow {
  id: number;
  public_id?: string | null;
  name: string;
  key_hash: string;
  key_prefix: string;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

type ApiKeyWithPublicId = ApiKey & { publicId?: string | null; apiKeyId: string };

function rowToApiKey(row: ApiKeyRow): ApiKeyWithPublicId {
  const apiKeyId = row.public_id ?? "";
  return {
    id: row.id,
    apiKeyId,
    publicId: row.public_id ?? null,
    name: row.name,
    keyHash: row.key_hash,
    keyPrefix: row.key_prefix,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  } as ApiKeyWithPublicId;
}

function genApiKeyPublicId(): string {
  return generatePublicId(PUBLIC_ID_PREFIXES.apiKey);
}

export class ApiKeyRepository {
  constructor(private readonly db: D1Database) {}

  async findAll(): Promise<ApiKeyWithPublicId[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM api_keys ORDER BY created_at DESC")
      .all<ApiKeyRow>();
    return results.map(rowToApiKey);
  }

  // SECURITY FIX #15 (lanjutan): tambah findByHash agar middleware bisa lookup
  // API key dari hash tanpa pernah menyimpan/mengirim key asli.
  async findByHash(keyHash: string): Promise<ApiKeyWithPublicId | null> {
    const row = await this.db
      .prepare("SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL")
      .bind(keyHash)
      .first<ApiKeyRow>();
    return row ? rowToApiKey(row) : null;
  }

  async findById(id: number): Promise<ApiKeyWithPublicId | null> {
    const row = await this.db.prepare("SELECT * FROM api_keys WHERE id = ?").bind(id).first<ApiKeyRow>();
    return row ? rowToApiKey(row) : null;
  }

  async findByPublicId(publicId: string): Promise<ApiKeyWithPublicId | null> {
    const row = await this.db.prepare("SELECT * FROM api_keys WHERE public_id = ?").bind(publicId).first<ApiKeyRow>();
    return row ? rowToApiKey(row) : null;
  }

  async findByPublicIdOrId(input: string | number): Promise<ApiKeyWithPublicId | null> {
    if (typeof input === "number" || /^\d+$/.test(String(input))) {
      const num = Number(input);
      if (!isNaN(num)) {
        const byId = await this.findById(num);
        if (byId) return byId;
      }
    }
    if (typeof input === "string") {
      const byPub = await this.findByPublicId(input);
      if (byPub) return byPub;
      const num = Number(input);
      if (!isNaN(num)) return this.findById(num);
    }
    return null;
  }

  async create(params: { name: string; keyHash: string; keyPrefix: string }): Promise<ApiKeyWithPublicId> {
    const publicId = genApiKeyPublicId();
    const row = await this.db
      .prepare("INSERT INTO api_keys (public_id, name, key_hash, key_prefix) VALUES (?, ?, ?, ?) RETURNING *")
      .bind(publicId, params.name, params.keyHash, params.keyPrefix)
      .first<ApiKeyRow>();

    if (!row) throw new Error("Failed to create API key: no row returned");
    return rowToApiKey(row);
  }

  async revoke(id: number): Promise<void> {
    await this.db.prepare("UPDATE api_keys SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
  }

  async revokeByPublicId(publicId: string): Promise<void> {
    await this.db.prepare("UPDATE api_keys SET revoked_at = CURRENT_TIMESTAMP WHERE public_id = ?").bind(publicId).run();
  }

  async revokeByPublicIdOrId(input: string | number): Promise<void> {
    if (typeof input === "number" || /^\d+$/.test(String(input))) {
      const num = Number(input);
      if (!isNaN(num)) {
        await this.revoke(num);
        return;
      }
    }
    if (typeof input === "string") {
      await this.revokeByPublicId(input);
    }
  }

  // SECURITY FIX #15 (lanjutan): update last_used_at untuk audit trail
  async updateLastUsed(id: number): Promise<void> {
    await this.db
      .prepare("UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(id)
      .run();
  }
}
