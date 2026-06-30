export class DownloadLogRepository {
  constructor(private readonly db: D1Database) {}

  /**
   * Catat download hanya jika belum ada log untuk file+IP yang sama
   * dalam 3 detik terakhir.
   *
   * Ini mencegah duplikasi yang disebabkan oleh:
   * - IDM multi-thread (banyak koneksi paralel yang masuk bersamaan)
   * - Browser yang mengirim probe Range request sebelum download penuh
   * - Resume download dari posisi mana pun (karena isFirstRequest difilter di route)
   *
   * Window 3 detik cukup panjang untuk menyaring burst dari IDM/Browser, 
   * tapi cukup pendek agar download sekuensial yang cepat (misal via wget di VPS) 
   * tetap terhitung sebagai download baru.
   */
  async createIfNotDuplicate(params: {
    fileId: number;
    ipAddress: string;
    country: string | null;
    userAgent: string | null;
    bytesServed: number;
    status: "completed" | "partial" | "failed";
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO download_logs (file_id, ip_address, country, user_agent, bytes_served, status)
         SELECT ?, ?, ?, ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM download_logs
           WHERE file_id = ?
             AND ip_address = ?
             AND created_at > datetime('now', '-3 seconds')
         )`
      )
      .bind(
        params.fileId, params.ipAddress, params.country,
        params.userAgent, params.bytesServed, params.status,
        params.fileId, params.ipAddress
      )
      .run();
  }

  /** @deprecated Gunakan createIfNotDuplicate untuk menghindari duplikasi. */
  async create(params: {
    fileId: number;
    ipAddress: string;
    country: string | null;
    userAgent: string | null;
    bytesServed: number;
    status: "completed" | "partial" | "failed";
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO download_logs (file_id, ip_address, country, user_agent, bytes_served, status)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(params.fileId, params.ipAddress, params.country, params.userAgent, params.bytesServed, params.status)
      .run();
  }
}
