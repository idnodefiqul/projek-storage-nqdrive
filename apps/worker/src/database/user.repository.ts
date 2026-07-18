import type { User } from "@nqdrive/types";
import { generatePublicId, PUBLIC_ID_PREFIXES } from "@nqdrive/shared";

interface UserRow {
  id: number;
  public_id?: string | null;
  username: string;
  email: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
  totp_secret?: string | null;
  totp_enabled?: number | null;
  backup_codes?: string | null;
}

type UserWithPublicId = User & {
  publicId?: string | null;
  adminId: string;
  userId?: string | null;
  totpSecret?: string | null;
  totpEnabled?: boolean;
  backupCodes?: string | null;
};

function rowToUser(row: UserRow): UserWithPublicId {
  const adminId = row.public_id ?? "";
  return {
    id: row.id,
    adminId,
    publicId: row.public_id ?? null,
    userId: row.public_id ?? null,
    username: row.username,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    totpSecret: row.totp_secret ?? null,
    totpEnabled: row.totp_enabled === 1,
    backupCodes: row.backup_codes ?? null,
  } as UserWithPublicId;
}

function genUserPublicId(): string {
  // Super Admin = sadm_ prefix sesuai permintaan user
  return generatePublicId(PUBLIC_ID_PREFIXES.superAdmin);
}

export class UserRepository {
  constructor(private readonly db: D1Database) {}

  /** Used by the first-run setup guard — NQDRIVE supports exactly one admin user. */
  async count(): Promise<number> {
    const row = await this.db.prepare("SELECT COUNT(*) as count FROM users").first<{ count: number }>();
    return row?.count ?? 0;
  }

  async findById(id: number): Promise<UserWithPublicId | null> {
    const row = await this.db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
    return row ? rowToUser(row) : null;
  }

  async findByPublicId(publicId: string): Promise<UserWithPublicId | null> {
    const row = await this.db
      .prepare("SELECT * FROM users WHERE public_id = ?")
      .bind(publicId)
      .first<UserRow>();
    return row ? rowToUser(row) : null;
  }

  async findByPublicIdOrId(input: string | number): Promise<UserWithPublicId | null> {
    if (typeof input === "number" || /^\d+$/.test(String(input))) {
      const num = Number(input);
      if (!isNaN(num)) {
        const byId = await this.findById(num);
        if (byId) return byId;
      }
    }
    if (typeof input === "string" && (input.startsWith("sadm_") || input.startsWith("usr_"))) {
      return this.findByPublicId(input);
    }
    // fallback: try as public_id generic
    if (typeof input === "string") {
      return this.findByPublicId(input);
    }
    return null;
  }

  async findByUsername(username: string): Promise<UserWithPublicId | null> {
    const row = await this.db
      .prepare("SELECT * FROM users WHERE username = ?")
      .bind(username)
      .first<UserRow>();
    return row ? rowToUser(row) : null;
  }

  async create(params: { username: string; email: string; passwordHash: string }): Promise<UserWithPublicId> {
    const publicId = genUserPublicId();
    const row = await this.db
      .prepare(
        `INSERT INTO users (public_id, username, email, password_hash) VALUES (?, ?, ?, ?) RETURNING *`
      )
      .bind(publicId, params.username, params.email, params.passwordHash)
      .first<UserRow>();

    if (!row) throw new Error("Failed to create user: no row returned");
    return rowToUser(row);
  }

  async updatePasswordHash(id: number, passwordHash: string): Promise<void> {
    await this.db
      .prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(passwordHash, id)
      .run();
  }
}
