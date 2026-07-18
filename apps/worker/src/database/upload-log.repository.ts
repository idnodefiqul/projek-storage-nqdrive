import { generatePublicId, PUBLIC_ID_PREFIXES } from "@nqdrive/shared";

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
    const publicId = generatePublicId(PUBLIC_ID_PREFIXES.uploadLog);
    try {
      await this.db
        .prepare(
          `INSERT INTO upload_logs (
             public_id, file_id, filename, size_bytes, drive_account_id, duration_ms, status, error_message
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          publicId,
          params.fileId,
          params.filename,
          params.sizeBytes,
          params.driveAccountId,
          params.durationMs,
          params.status,
          params.errorMessage,
        )
        .run();
    } catch (e) {
      // Fallback if public_id column not exists yet
      if (String(e).includes("no column named public_id") || String(e).includes("has no column named public_id")) {
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
      } else {
        throw e;
      }
    }
  }
}
