export class DownloadLogRepository {
  constructor(private readonly db: D1Database) {}

  async create(params: {
    fileId: number;
    ipAddress: string;
    userAgent: string | null;
    bytesServed: number;
    status: "completed" | "partial" | "failed";
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO download_logs (file_id, ip_address, user_agent, bytes_served, status)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(params.fileId, params.ipAddress, params.userAgent, params.bytesServed, params.status)
      .run();
  }
}
