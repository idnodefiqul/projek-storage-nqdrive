import { generatePublicId, PUBLIC_ID_PREFIXES } from "@nqdrive/shared";

export class DownloadLogRepository {
  constructor(private readonly db: D1Database) {}

  private genPublicId(): string {
    return generatePublicId(PUBLIC_ID_PREFIXES.downloadLog);
  }

  /**
   * Catat download hanya jika belum ada log untuk file+IP yang sama
   * dalam 3 detik terakhir.
   */
  async createIfNotDuplicate(params: {
    fileId: number;
    ipAddress: string;
    country: string | null;
    userAgent: string | null;
    bytesServed: number;
    status: "completed" | "partial" | "failed";
  }): Promise<void> {
    const publicId = this.genPublicId();
    try {
      await this.db
        .prepare(
          `INSERT INTO download_logs (public_id, file_id, ip_address, country, user_agent, bytes_served, status)
           SELECT ?, ?, ?, ?, ?, ?, ?
           WHERE NOT EXISTS (
             SELECT 1 FROM download_logs
             WHERE file_id = ?
               AND ip_address = ?
               AND created_at > datetime('now', '-3 seconds')
           )`
        )
        .bind(
          publicId, params.fileId, params.ipAddress, params.country,
          params.userAgent, params.bytesServed, params.status,
          params.fileId, params.ipAddress
        )
        .run();
    } catch (e) {
      if (String(e).includes("no column named public_id") || String(e).includes("has no column named public_id")) {
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
      } else {
        throw e;
      }
    }
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
    const publicId = this.genPublicId();
    try {
      await this.db
        .prepare(
          `INSERT INTO download_logs (public_id, file_id, ip_address, country, user_agent, bytes_served, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(publicId, params.fileId, params.ipAddress, params.country, params.userAgent, params.bytesServed, params.status)
        .run();
    } catch {
      await this.db
        .prepare(
          `INSERT INTO download_logs (file_id, ip_address, country, user_agent, bytes_served, status)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(params.fileId, params.ipAddress, params.country, params.userAgent, params.bytesServed, params.status)
        .run();
    }
  }
}
