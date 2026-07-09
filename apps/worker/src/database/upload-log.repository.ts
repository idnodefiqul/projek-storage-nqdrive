export class UploadLogRepository {
  constructor(private readonly db: D1Database) {}

  async create(params: {
    fileId: number | null;
    filename: string;
    sizeBytes: number;
    driveAccountId: number;
    durationMs: number;
    status: "success" | "failed" | "cancelled";
    errorMessage: string | null;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO upload_logs (
           file_id, filename, size_bytes, drive_account_id, duration_ms, status, error_message
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        params.fileId,
        params.filename,
        params.sizeBytes,
        params.driveAccountId,
        params.durationMs,
        params.status,
        params.errorMessage,
      )
      .run();
  }
}
