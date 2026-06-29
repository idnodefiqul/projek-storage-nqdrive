import type { User } from "@nqdrive/types";

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class UserRepository {
  constructor(private readonly db: D1Database) {}

  /** Used by the first-run setup guard — NQDRIVE supports exactly one admin user. */
  async count(): Promise<number> {
    const row = await this.db.prepare("SELECT COUNT(*) as count FROM users").first<{ count: number }>();
    return row?.count ?? 0;
  }

  async findByUsername(username: string): Promise<User | null> {
    const row = await this.db
      .prepare("SELECT * FROM users WHERE username = ?")
      .bind(username)
      .first<UserRow>();
    return row ? rowToUser(row) : null;
  }

  async findById(id: number): Promise<User | null> {
    const row = await this.db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
    return row ? rowToUser(row) : null;
  }

  async create(params: { username: string; passwordHash: string }): Promise<User> {
    const row = await this.db
      .prepare(
        `INSERT INTO users (username, password_hash) VALUES (?, ?) RETURNING *`
      )
      .bind(params.username, params.passwordHash)
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
