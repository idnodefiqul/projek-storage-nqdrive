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
}
