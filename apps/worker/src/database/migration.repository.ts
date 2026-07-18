/**
 * Repository layer untuk tabel `migration_jobs` + `migration_items`.
 *
 * State migrasi drive-ke-drive disimpan di D1 (bukan di browser) sehingga
 * proses bisa dilanjutkan kapan saja oleh loop frontend maupun cron backstop.
 */
import { generatePublicId, PUBLIC_ID_PREFIXES } from "@nqdrive/shared";

export type MigrationJobStatus = "running" | "completed" | "failed" | "cancelled";
export type MigrationItemStatus = "pending" | "processing" | "done" | "failed";

export interface MigrationJob {
  id: number;
  publicId?: string | null;
  taskId?: string | null;
  sourceAccountId: number;
  targetAccountId: number;
  sourceAccountPublicId?: string | null;
  targetAccountPublicId?: string | null;
  sourceEmail: string;
  targetEmail: string;
  status: MigrationJobStatus;
  totalFiles: number;
  migratedFiles: number;
  failedFiles: number;
  totalBytes: number;
  migratedBytes: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface MigrationItem {
  id: number;
  publicId?: string | null;
  jobId: number;
  /** NULL = file drive asli yang tidak tercatat di dashboard. */
  fileId: number | null;
  providerFileId: string;
  filename: string;
  sizeBytes: number;
  /** Visibility file sebelum migrasi (dikembalikan setelah file pindah). */
  originalVisibility: string | null;
  status: MigrationItemStatus;
  error: string | null;
}

interface MigrationJobRow {
  id: number;
  public_id?: string | null;
  source_account_id: number;
  target_account_id: number;
  source_email: string;
  target_email: string;
  source_account_public_id?: string | null;
  target_account_public_id?: string | null;
  status: string;
  total_files: number;
  migrated_files: number;
  failed_files: number;
  total_bytes: number;
  migrated_bytes: number;
  error: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

interface MigrationItemRow {
  id: number;
  public_id?: string | null;
  job_id: number;
  file_id: number | null;
  provider_file_id: string;
  filename: string;
  size_bytes: number;
  original_visibility: string | null;
  status: string;
  error: string | null;
}

function rowToJob(row: MigrationJobRow): MigrationJob {
  const pub = (row as any).public_id ?? null;
  return {
    id: row.id,
    publicId: pub,
    taskId: pub,
    sourceAccountId: row.source_account_id,
    targetAccountId: row.target_account_id,
    sourceAccountPublicId: (row as any).source_account_public_id ?? null,
    targetAccountPublicId: (row as any).target_account_public_id ?? null,
    sourceEmail: row.source_email,
    targetEmail: row.target_email,
    status: row.status as MigrationJobStatus,
    totalFiles: row.total_files,
    migratedFiles: row.migrated_files,
    failedFiles: row.failed_files,
    totalBytes: row.total_bytes,
    migratedBytes: row.migrated_bytes,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
  };
}

function rowToItem(row: MigrationItemRow): MigrationItem {
  const pub = (row as any).public_id ?? null;
  return {
    id: row.id,
    publicId: pub,
    jobId: row.job_id,
    fileId: row.file_id,
    providerFileId: row.provider_file_id,
    filename: row.filename,
    sizeBytes: row.size_bytes,
    originalVisibility: row.original_visibility,
    status: row.status as MigrationItemStatus,
    error: row.error,
  };
}

function genTaskPublicId(): string {
  return generatePublicId(PUBLIC_ID_PREFIXES.task);
}
function genMigrationItemPublicId(): string {
  return generatePublicId(PUBLIC_ID_PREFIXES.migrationItem);
}

// Query dasar job + email + public_id kedua akun (professional IDs)
const JOB_SELECT = `
  SELECT m.*, s.email AS source_email, t.email AS target_email,
         s.public_id AS source_account_public_id, t.public_id AS target_account_public_id
  FROM migration_jobs m
  JOIN drive_accounts s ON s.id = m.source_account_id
  JOIN drive_accounts t ON t.id = m.target_account_id`;

export class MigrationRepository {
  constructor(private readonly db: D1Database) {}

  async findById(id: number): Promise<MigrationJob | null> {
    const row = await this.db
      .prepare(`${JOB_SELECT} WHERE m.id = ?`)
      .bind(id)
      .first<MigrationJobRow>();
    return row ? rowToJob(row) : null;
  }

  async findByPublicId(publicId: string): Promise<MigrationJob | null> {
    const row = await this.db
      .prepare(`${JOB_SELECT} WHERE m.public_id = ?`)
      .bind(publicId)
      .first<MigrationJobRow>();
    return row ? rowToJob(row) : null;
  }

  async findByPublicIdOrId(input: string | number): Promise<MigrationJob | null> {
    if (typeof input === "number" || /^\d+$/.test(String(input))) {
      const num = Number(input);
      if (!isNaN(num)) {
        const byId = await this.findById(num);
        if (byId) return byId;
      }
    }
    if (typeof input === "string") {
      const byPub = await this.findByPublicId(input);
      if (byPub) return byPub;
      const num = Number(input);
      if (!isNaN(num)) return this.findById(num);
    }
    return null;
  }

  async findRunning(): Promise<MigrationJob[]> {
    const { results } = await this.db
      .prepare(`${JOB_SELECT} WHERE m.status = 'running' ORDER BY m.created_at ASC`)
      .all<MigrationJobRow>();
    return results.map(rowToJob);
  }

  /** Job aktif yang menyentuh akun ini (sebagai sumber ATAU target). */
  async findRunningForAccount(accountId: number): Promise<MigrationJob | null> {
    const row = await this.db
      .prepare(
        `${JOB_SELECT} WHERE m.status = 'running'
           AND (m.source_account_id = ? OR m.target_account_id = ?)
         LIMIT 1`
      )
      .bind(accountId, accountId)
      .first<MigrationJobRow>();
    return row ? rowToJob(row) : null;
  }

  async findRecent(limit = 10): Promise<MigrationJob[]> {
    const { results } = await this.db
      .prepare(`${JOB_SELECT} WHERE m.status != 'running' ORDER BY m.finished_at DESC LIMIT ?`)
      .bind(limit)
      .all<MigrationJobRow>();
    return results.map(rowToJob);
  }

  async create(params: {
    sourceAccountId: number;
    targetAccountId: number;
    totalFiles: number;
    totalBytes: number;
  }): Promise<number> {
    const publicId = genTaskPublicId();
    const row = await this.db
      .prepare(
        `INSERT INTO migration_jobs (public_id, source_account_id, target_account_id, total_files, total_bytes)
         VALUES (?, ?, ?, ?, ?)
         RETURNING id`
      )
      .bind(publicId, params.sourceAccountId, params.targetAccountId, params.totalFiles, params.totalBytes)
      .first<{ id: number }>();

    if (!row) throw new Error("Failed to create migration job: no row returned");
    return row.id;
  }

  async createReturningJob(params: {
    sourceAccountId: number;
    targetAccountId: number;
    totalFiles: number;
    totalBytes: number;
  }): Promise<MigrationJob> {
    const publicId = genTaskPublicId();
    const row = await this.db
      .prepare(
        `INSERT INTO migration_jobs (public_id, source_account_id, target_account_id, total_files, total_bytes)
         VALUES (?, ?, ?, ?, ?)
         RETURNING id, public_id`
      )
      .bind(publicId, params.sourceAccountId, params.targetAccountId, params.totalFiles, params.totalBytes)
      .first<{ id: number; public_id: string }>();
    if (!row) throw new Error("Failed to create migration job");
    const job = await this.findById(row.id);
    if (!job) throw new Error("Failed to fetch created job");
    return job;
  }

  /** Isi item per file sekaligus (batch insert) saat job dibuat. */
  async createItems(
    jobId: number,
    files: Array<{
      fileId: number | null;
      providerFileId: string;
      filename: string;
      sizeBytes: number;
      originalVisibility: string | null;
    }>
  ): Promise<void> {
    const statements = files.map((file) => {
      const pub = genMigrationItemPublicId();
      return this.db
        .prepare(
          `INSERT INTO migration_items
             (public_id, job_id, file_id, provider_file_id, filename, size_bytes, original_visibility)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          pub,
          jobId,
          file.fileId,
          file.providerFileId,
          file.filename,
          file.sizeBytes,
          file.originalVisibility
        );
    });
    // D1 batch: maksimal aman per panggilan, pecah per 50 statement.
    for (let offset = 0; offset < statements.length; offset += 50) {
      await this.db.batch(statements.slice(offset, offset + 50));
    }
  }

  /**
   * Kembalikan visibility asli file yang BELUM selesai dipindah (job selesai/
   * gagal/dibatalkan) — supaya file public yang sempat di-private-kan selama
   * migrasi muncul lagi di page download. Item 'done' sudah dikembalikan
   * satu-per-satu saat filenya pindah.
   */
  async restoreVisibilityForUnfinished(jobId: number): Promise<void> {
    await this.db
      .prepare(
        `UPDATE files
         SET visibility = 'public', updated_at = CURRENT_TIMESTAMP
         WHERE id IN (
           SELECT file_id FROM migration_items
           WHERE job_id = ? AND status != 'done'
             AND file_id IS NOT NULL AND original_visibility = 'public'
         )`
      )
      .bind(jobId)
      .run();
  }

  /**
   * Item 'processing' yang macet (invocation mati di tengah jalan) dikembalikan
   * ke 'pending' setelah 10 menit agar bisa diproses ulang.
   */
  async resetStaleProcessing(jobId: number): Promise<void> {
    await this.db
      .prepare(
        `UPDATE migration_items SET status = 'pending', updated_at = CURRENT_TIMESTAMP
         WHERE job_id = ? AND status = 'processing'
           AND updated_at < datetime('now', '-10 minutes')`
      )
      .bind(jobId)
      .run();
  }

  /**
   * Klaim item pending secara optimis: UPDATE per item dengan guard status='pending'
   * — kalau loop frontend dan cron berlomba, hanya satu yang menang per item
   * sehingga file tidak pernah dimigrasikan dua kali.
   */
  async claimPendingItems(jobId: number, limit: number): Promise<MigrationItem[]> {
    const { results } = await this.db
      .prepare(
        "SELECT * FROM migration_items WHERE job_id = ? AND status = 'pending' ORDER BY id ASC LIMIT ?"
      )
      .bind(jobId, limit)
      .all<MigrationItemRow>();

    const claimed: MigrationItem[] = [];
    for (const row of results) {
      const result = await this.db
        .prepare(
          `UPDATE migration_items SET status = 'processing', updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = 'pending'`
        )
        .bind(row.id)
        .run();
      if (result.meta.changes > 0) claimed.push(rowToItem(row));
    }
    return claimed;
  }

  async markItemDone(itemId: number): Promise<void> {
    await this.db
      .prepare(
        "UPDATE migration_items SET status = 'done', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      )
      .bind(itemId)
      .run();
  }

  async markItemFailed(itemId: number, error: string): Promise<void> {
    await this.db
      .prepare(
        "UPDATE migration_items SET status = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      )
      .bind(error.slice(0, 500), itemId)
      .run();
  }

  /** Sinkronkan counter job dari agregat item (idempoten & aman dipanggil berulang). */
  async refreshJobCounters(jobId: number): Promise<void> {
    await this.db
      .prepare(
        `UPDATE migration_jobs SET
           migrated_files = (SELECT COUNT(*) FROM migration_items WHERE job_id = ?1 AND status = 'done'),
           failed_files   = (SELECT COUNT(*) FROM migration_items WHERE job_id = ?1 AND status = 'failed'),
           migrated_bytes = (SELECT COALESCE(SUM(size_bytes), 0) FROM migration_items WHERE job_id = ?1 AND status = 'done'),
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1`
      )
      .bind(jobId)
      .run();
  }

  /** Sisa item yang belum final (pending + processing). Job selesai saat ini 0. */
  async countRemainingItems(jobId: number): Promise<number> {
    const row = await this.db
      .prepare(
        "SELECT COUNT(*) AS count FROM migration_items WHERE job_id = ? AND status IN ('pending', 'processing')"
      )
      .bind(jobId)
      .first<{ count: number }>();
    return row?.count ?? 0;
  }

  async finishJob(jobId: number, status: Exclude<MigrationJobStatus, "running">, error?: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE migration_jobs
         SET status = ?, error = ?, finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(status, error?.slice(0, 500) ?? null, jobId)
      .run();
  }
}
