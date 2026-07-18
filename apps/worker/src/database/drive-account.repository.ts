import type { DriveAccount, DriveAccountStatus, StorageProviderType } from "@nqdrive/types";
import { generatePublicId, PUBLIC_ID_PREFIXES } from "@nqdrive/shared";

/**
 * Repository layer for the `drive_accounts` table.
 *
 * Design rationale: isolates raw SQL/D1 calls from the rest of the application (routes,
 * services). Routes and services only ever talk to this repository's typed methods —
 * if D1's API changes or we ever swap the database, only this file needs to change.
 */

interface DriveAccountRow {
  id: number;
  public_id?: string | null;
  email: string;
  provider: string;
  refresh_token_encrypted: string;
  access_token: string | null;
  access_token_expires_at: string | null;
  total_storage_bytes: number;
  used_storage_bytes: number;
  available_storage_bytes: number;
  status: string;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

type DriveAccountWithPublicId = DriveAccount & {
  publicId?: string | null;
  accountId: string;
};

function rowToDriveAccount(row: DriveAccountRow): DriveAccountWithPublicId {
  const accountId = row.public_id ?? "";
  return {
    id: row.id,
    accountId,
    publicId: row.public_id ?? null,
    email: row.email,
    provider: row.provider as StorageProviderType,
    refreshTokenEncrypted: row.refresh_token_encrypted,
    accessToken: row.access_token,
    accessTokenExpiresAt: row.access_token_expires_at,
    totalStorageBytes: row.total_storage_bytes,
    usedStorageBytes: row.used_storage_bytes,
    availableStorageBytes: row.available_storage_bytes,
    status: row.status as DriveAccountStatus,
    lastSyncedAt: row.last_synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } as DriveAccountWithPublicId;
}

function genAccountPublicId(): string {
  return generatePublicId(PUBLIC_ID_PREFIXES.account);
}

export class DriveAccountRepository {
  constructor(private readonly db: D1Database) {}

  async findAll(): Promise<DriveAccount[]> {
    // FIX: Jangan filter refresh_token_encrypted — akun yang di-disconnect (status offline)
    // karena masih punya file tetap harus terhitung. Filter sebelumnya bikin
    // distribusi cuma 3 padahal Google Drive ada 4. Sync cron nanti skip manual jika token kosong.
    // FIX: exclude provider telegram, box, koofr yang sudah dihapus user tapi masih nyangkut di DB
    const { results } = await this.db
      .prepare("SELECT * FROM drive_accounts WHERE provider NOT IN ('telegram','box','koofr') ORDER BY created_at DESC")
      .all<DriveAccountRow>();
    return results.map(rowToDriveAccount);
  }

  // Untuk keperluan yang butuh hanya akun aktif (masih punya refresh token)
  async findAllActive(): Promise<DriveAccount[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM drive_accounts WHERE refresh_token_encrypted != '' AND provider NOT IN ('telegram','box','koofr') ORDER BY created_at DESC")
      .all<DriveAccountRow>();
    return results.map(rowToDriveAccount);
  }

  async findOnline(): Promise<DriveAccount[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM drive_accounts WHERE status = 'online' AND provider NOT IN ('telegram','box','koofr') ORDER BY available_storage_bytes DESC")
      .all<DriveAccountRow>();
    return results.map(rowToDriveAccount);
  }

  async findById(id: number): Promise<DriveAccountWithPublicId | null> {
    const row = await this.db
      .prepare("SELECT * FROM drive_accounts WHERE id = ?")
      .bind(id)
      .first<DriveAccountRow>();
    return row ? rowToDriveAccount(row) : null;
  }

  async findByPublicId(publicId: string): Promise<DriveAccountWithPublicId | null> {
    const row = await this.db
      .prepare("SELECT * FROM drive_accounts WHERE public_id = ?")
      .bind(publicId)
      .first<DriveAccountRow>();
    return row ? rowToDriveAccount(row) : null;
  }

  async findByPublicIdOrId(input: string | number): Promise<DriveAccountWithPublicId | null> {
    if (typeof input === "number" || /^\d+$/.test(String(input))) {
      const num = Number(input);
      if (!isNaN(num)) {
        const byId = await this.findById(num);
        if (byId) return byId;
      }
    }
    if (typeof input === "string" && (input.startsWith("acc_") || input.startsWith("acc"))) {
      const byPub = await this.findByPublicId(input);
      if (byPub) return byPub;
    }
    if (typeof input === "string") {
      // Try public_id generic fallback
      const byPub = await this.findByPublicId(input);
      if (byPub) return byPub;
      // Try numeric string fallback
      const num = Number(input);
      if (!isNaN(num)) return this.findById(num);
    }
    return null;
  }

  async findByEmail(email: string): Promise<DriveAccountWithPublicId | null> {
    const row = await this.db
      .prepare("SELECT * FROM drive_accounts WHERE email = ?")
      .bind(email)
      .first<DriveAccountRow>();
    return row ? rowToDriveAccount(row) : null;
  }

  /**
   * Cari akun berdasarkan email DAN provider. Satu email boleh dipakai di beberapa
   * provider berbeda (mis. Gmail yang sama untuk Google Drive dan Dropbox), jadi
   * dedup saat connect harus per-provider — bukan per-email global.
   */
  async findByEmailAndProvider(
    email: string,
    provider: StorageProviderType
  ): Promise<DriveAccount | null> {
    const row = await this.db
      .prepare("SELECT * FROM drive_accounts WHERE email = ? AND provider = ?")
      .bind(email, provider)
      .first<DriveAccountRow>();
    return row ? rowToDriveAccount(row) : null;
  }

  async create(params: {
    email: string;
    provider: StorageProviderType;
    refreshTokenEncrypted: string;
    accessToken: string;
    accessTokenExpiresAt: string;
    totalStorageBytes: number;
    usedStorageBytes: number;
    availableStorageBytes: number;
  }): Promise<DriveAccountWithPublicId> {
    const publicId = genAccountPublicId();
    const row = await this.db
      .prepare(
        `INSERT INTO drive_accounts (
           public_id, email, provider, refresh_token_encrypted, access_token, access_token_expires_at,
           total_storage_bytes, used_storage_bytes, available_storage_bytes, status, last_synced_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'online', CURRENT_TIMESTAMP)
         RETURNING *`
      )
      .bind(
        publicId,
        params.email,
        params.provider,
        params.refreshTokenEncrypted,
        params.accessToken,
        params.accessTokenExpiresAt,
        params.totalStorageBytes,
        params.usedStorageBytes,
        params.availableStorageBytes
      )
      .first<DriveAccountRow>();

    if (!row) throw new Error("Failed to create drive account: no row returned");
    return rowToDriveAccount(row);
  }

  /** Updates the cached access token after a cron-triggered refresh. */
  async updateAccessToken(id: number, accessToken: string, expiresAt: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE drive_accounts
         SET access_token = ?, access_token_expires_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(accessToken, expiresAt, id)
      .run();
  }

  /** Updates cached quota figures after a sync (cron job or manual refresh). */
  async updateQuota(
    id: number,
    quota: { totalBytes: number; usedBytes: number; availableBytes: number }
  ): Promise<void> {
    await this.db
      .prepare(
        `UPDATE drive_accounts
         SET total_storage_bytes = ?, used_storage_bytes = ?, available_storage_bytes = ?,
             last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(quota.totalBytes, quota.usedBytes, quota.availableBytes, id)
      .run();
  }

  async updateStatus(id: number, status: DriveAccountStatus): Promise<void> {
    await this.db
      .prepare("UPDATE drive_accounts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(status, id)
      .run();
  }

  /** Throws (FK RESTRICT) if files still reference this account — caller should surface that clearly. */
  async delete(id: number): Promise<void> {
    await this.db.prepare("DELETE FROM drive_accounts WHERE id = ?").bind(id).run();
  }

  async reconnect(
    id: number,
    params: {
      refreshTokenEncrypted: string;
      accessToken: string;
      accessTokenExpiresAt: string;
      totalStorageBytes: number;
      usedStorageBytes: number;
      availableStorageBytes: number;
    }
  ): Promise<DriveAccount> {
    const row = await this.db
      .prepare(
        `UPDATE drive_accounts
         SET refresh_token_encrypted = ?, access_token = ?, access_token_expires_at = ?,
             total_storage_bytes = ?, used_storage_bytes = ?, available_storage_bytes = ?,
             status = 'online', last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
         RETURNING *`
      )
      .bind(
        params.refreshTokenEncrypted,
        params.accessToken,
        params.accessTokenExpiresAt,
        params.totalStorageBytes,
        params.usedStorageBytes,
        params.availableStorageBytes,
        id
      )
      .first<DriveAccountRow>();

    if (!row) throw new Error("Failed to reconnect drive account: no row returned");
    return rowToDriveAccount(row);
  }
}
