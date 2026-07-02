export class SettingsRepository {
  constructor(private readonly db: D1Database) {}

  async get(key: string): Promise<string | null> {
    const row = await this.db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .bind(key)
      .first<{ value: string }>();
    return row?.value ?? null;
  }

  /** Upsert — works whether the key was seeded by migration or not yet present. */
  async set(key: string, value: string): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
      )
      .bind(key, value)
      .run();
  }

  /** Get multiple keys at once. Returns a map of key → value (missing keys are null). */
  async getMany(keys: string[]): Promise<Record<string, string | null>> {
    if (keys.length === 0) return {};
    const placeholders = keys.map(() => "?").join(", ");
    const rows = await this.db
      .prepare(`SELECT key, value FROM settings WHERE key IN (${placeholders})`)
      .bind(...keys)
      .all<{ key: string; value: string }>();

    const result: Record<string, string | null> = {};
    for (const k of keys) result[k] = null;
    for (const row of rows.results) result[row.key] = row.value;
    return result;
  }

  /** Set multiple key-value pairs in one go (sequential upserts). */
  async setMany(entries: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(entries)) {
      await this.set(key, value);
    }
  }
}
