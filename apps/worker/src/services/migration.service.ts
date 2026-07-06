import { MigrationRepository } from "../database/migration.repository";
import { DriveAccountRepository } from "../database/drive-account.repository";
import { FileRepository } from "../database/file.repository";
import { GoogleAccountConnectionService } from "./google-account-connection.service";
import { StorageProviderFactory } from "@nqdrive/storage";
import type { MigrationJob, MigrationItem } from "../database/migration.repository";
import type { DriveAccount } from "@nqdrive/types";
import type { Env } from "../config/env";

// Cadangan ruang kosong yang sama dengan pemilih akun upload (account-selector).
const RESERVE_BYTES = 1 * 1024 * 1024 * 1024;

// Jumlah file per batch process. Kecil supaya tiap request singkat dan
// aman dari limit subrequest/waktu Cloudflare Workers.
export const MIGRATION_BATCH_SIZE = 5;

interface SourceFileRow {
  id: number;
  filename: string;
  provider_file_id: string;
  drive_account_id: number;
  size_bytes: number;
  mime_type: string;
}

/**
 * MigrationService — memindahkan seluruh isi satu akun Google Drive ke akun lain.
 *
 * Metode per file: share (token sumber) → copy server-side (token target) →
 * update record DB → hapus file sumber. Urutan ini menjamin download tidak
 * pernah menunjuk lokasi yang sudah tidak ada. Kalau copy gagal (file tidak
 * bisa di-copy), fallback ke streaming download→upload lewat worker.
 *
 * State job ada di D1 — batch bisa dipicu loop frontend maupun cron backstop.
 */
export class MigrationService {
  private readonly migrationRepository: MigrationRepository;
  private readonly driveAccountRepository: DriveAccountRepository;
  private readonly fileRepository: FileRepository;
  private readonly connectionService: GoogleAccountConnectionService;

  constructor(private readonly env: Env) {
    this.migrationRepository = new MigrationRepository(env.DB);
    this.driveAccountRepository = new DriveAccountRepository(env.DB);
    this.fileRepository = new FileRepository(env.DB);
    this.connectionService = new GoogleAccountConnectionService(env);
  }

  async createJob(sourceAccountId: number, targetAccountId: number): Promise<MigrationJob> {
    if (sourceAccountId === targetAccountId) {
      throw new Error("Akun sumber dan tujuan tidak boleh sama.");
    }

    const source = await this.driveAccountRepository.findById(sourceAccountId);
    const target = await this.driveAccountRepository.findById(targetAccountId);
    if (!source || !target) {
      throw new Error("Akun tidak ditemukan.");
    }

    const existingSource = await this.migrationRepository.findRunningForAccount(sourceAccountId);
    const existingTarget = await this.migrationRepository.findRunningForAccount(targetAccountId);
    if (existingSource || existingTarget) {
      throw new Error("Masih ada migrasi lain yang berjalan untuk akun ini. Tunggu sampai selesai.");
    }

    // Validasi token kedua akun DI AWAL — gagal cepat sebelum job dibuat.
    const sourceToken = await this.connectionService.getValidAccessToken(source);
    await this.connectionService.getValidAccessToken(target);

    // 1) File yang tercatat di dashboard (termasuk yang ada di Trash dashboard),
    //    supaya drive sumber benar-benar kosong setelah migrasi.
    const { results: dbFiles } = await this.env.DB.prepare(
      "SELECT id, size_bytes, provider_file_id, visibility FROM files WHERE drive_account_id = ?"
    ).bind(sourceAccountId).all<{
      id: number;
      size_bytes: number;
      provider_file_id: string;
      visibility: string;
    }>();

    // 2) SEMUA file di Google Drive asli — file yang tidak tercatat di dashboard
    //    (file lama, sisa upload, dsb.) ikut dipindahkan juga.
    const sourceProvider = StorageProviderFactory.resolve(source.provider);
    let driveFiles: Array<{ providerFileId: string; filename: string; sizeBytes: number }> = [];
    if (sourceProvider.listFiles) {
      driveFiles = await sourceProvider.listFiles({ credentials: { accessToken: sourceToken } });
    }
    const trackedProviderIds = new Set(dbFiles.map((file) => file.provider_file_id));
    const untrackedFiles = driveFiles.filter((file) => !trackedProviderIds.has(file.providerFileId));

    const items = [
      ...dbFiles.map((file) => ({
        fileId: file.id,
        providerFileId: file.provider_file_id,
        filename: "",
        sizeBytes: file.size_bytes ?? 0,
        originalVisibility: file.visibility,
      })),
      ...untrackedFiles.map((file) => ({
        fileId: null,
        providerFileId: file.providerFileId,
        filename: file.filename,
        sizeBytes: file.sizeBytes,
        originalVisibility: null,
      })),
    ];

    if (items.length === 0) {
      throw new Error("Tidak ada file untuk dimigrasikan dari akun ini.");
    }

    const totalBytes = items.reduce((sum, item) => sum + item.sizeBytes, 0);
    if (target.availableStorageBytes < totalBytes + RESERVE_BYTES) {
      throw new Error(
        "Ruang kosong akun tujuan tidak cukup untuk menampung semua file (plus cadangan 1 GB)."
      );
    }

    const jobId = await this.migrationRepository.create({
      sourceAccountId,
      targetAccountId,
      totalFiles: items.length,
      totalBytes,
    });
    await this.migrationRepository.createItems(jobId, items);

    // Sembunyikan dulu file public dari page download selama proses migrasi.
    // Visibility asli sudah terekam di migration_items — dikembalikan per file
    // begitu filenya selesai pindah ke akun baru.
    await this.env.DB.prepare(
      "UPDATE files SET visibility = 'private', updated_at = CURRENT_TIMESTAMP WHERE drive_account_id = ? AND visibility = 'public'"
    ).bind(sourceAccountId).run();

    const job = await this.migrationRepository.findById(jobId);
    if (!job) throw new Error("Gagal membuat job migrasi.");
    return job;
  }

  /**
   * Proses satu batch. Dipanggil berulang oleh loop frontend (real-time) dan
   * cron backstop (saat tab ditutup). Mengembalikan state job terbaru.
   */
  async processBatch(jobId: number, maxFiles = MIGRATION_BATCH_SIZE): Promise<MigrationJob> {
    const job = await this.migrationRepository.findById(jobId);
    if (!job) throw new Error("Job migrasi tidak ditemukan.");
    if (job.status !== "running") return job;

    await this.migrationRepository.resetStaleProcessing(jobId);
    const items = await this.migrationRepository.claimPendingItems(jobId, maxFiles);

    if (items.length === 0) {
      return this.finalizeIfDone(jobId) as Promise<MigrationJob>;
    }

    const source = await this.driveAccountRepository.findById(job.sourceAccountId);
    const target = await this.driveAccountRepository.findById(job.targetAccountId);
    if (!source || !target) {
      await this.migrationRepository.finishJob(jobId, "failed", "Akun sumber/tujuan sudah dihapus.");
      return (await this.migrationRepository.findById(jobId))!;
    }

    const sourceToken = await this.connectionService.getValidAccessToken(source);
    const targetToken = await this.connectionService.getValidAccessToken(target);

    for (const item of items) {
      try {
        await this.migrateOneFile(item, source, target, sourceToken, targetToken);
        await this.migrationRepository.markItemDone(item.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error(`Migrasi file ${item.fileId} (job ${jobId}) gagal:`, error);
        await this.migrationRepository.markItemFailed(item.id, message);
      }
    }

    await this.migrationRepository.refreshJobCounters(jobId);
    const finalized = await this.finalizeIfDone(jobId);
    return finalized ?? (await this.migrationRepository.findById(jobId))!;
  }

  async cancelJob(jobId: number): Promise<MigrationJob> {
    const job = await this.migrationRepository.findById(jobId);
    if (!job) throw new Error("Job migrasi tidak ditemukan.");
    if (job.status === "running") {
      await this.migrationRepository.refreshJobCounters(jobId);
      await this.migrationRepository.finishJob(jobId, "cancelled");
      // File yang batal dipindah dikembalikan visibility aslinya agar
      // muncul lagi di page download.
      await this.migrationRepository.restoreVisibilityForUnfinished(jobId);
      await this.syncQuotas(job.sourceAccountId, job.targetAccountId);
    }
    return (await this.migrationRepository.findById(jobId))!;
  }

  // ── internal ──────────────────────────────────────────────────────────────

  private async migrateOneFile(
    item: MigrationItem,
    source: DriveAccount,
    target: DriveAccount,
    sourceToken: string,
    targetToken: string
  ): Promise<void> {
    const sourceProvider = StorageProviderFactory.resolve(source.provider);
    const targetProvider = StorageProviderFactory.resolve(target.provider);

    // ── File drive asli yang TIDAK tercatat di dashboard ────────────────────
    // Cukup dipindahkan fisiknya: share → copy → hapus sumber. Tidak ada
    // record database yang perlu diarahkan ulang.
    if (item.fileId === null) {
      await this.transferFile({
        sourceProvider,
        targetProvider,
        sourceToken,
        targetToken,
        providerFileId: item.providerFileId,
        filename: item.filename || "untitled",
        mimeType: "application/octet-stream",
        sizeBytes: item.sizeBytes,
        targetEmail: target.email,
      });
      await this.deleteSourceFile(sourceProvider, sourceToken, item.providerFileId);
      return;
    }

    // ── File yang tercatat di dashboard ─────────────────────────────────────
    const file = await this.env.DB.prepare(
      "SELECT id, filename, provider_file_id, drive_account_id, size_bytes, mime_type FROM files WHERE id = ?"
    ).bind(item.fileId).first<SourceFileRow>();

    // File sudah dihapus / sudah pindah sejak job dibuat — tidak ada yang perlu dikerjakan.
    if (!file || file.drive_account_id !== source.id) return;

    const newProviderFileId = await this.transferFile({
      sourceProvider,
      targetProvider,
      sourceToken,
      targetToken,
      providerFileId: file.provider_file_id,
      filename: file.filename,
      mimeType: file.mime_type,
      sizeBytes: file.size_bytes,
      targetEmail: target.email,
    });

    // Copy sukses → arahkan record DB ke lokasi baru DULU, baru hapus sumber.
    await this.fileRepository.updateProviderLocation(file.id, target.id, newProviderFileId);

    // File sudah aman di akun baru — kembalikan visibility public yang sempat
    // di-private-kan saat migrasi dimulai, agar muncul lagi di page download.
    if (item.originalVisibility === "public") {
      await this.fileRepository.updateVisibility(file.id, "public");
    }

    await this.deleteSourceFile(sourceProvider, sourceToken, file.provider_file_id);
  }

  /** Pindahkan fisik satu file: share+copy server-side, fallback streaming. */
  private async transferFile(params: {
    sourceProvider: ReturnType<typeof StorageProviderFactory.resolve>;
    targetProvider: ReturnType<typeof StorageProviderFactory.resolve>;
    sourceToken: string;
    targetToken: string;
    providerFileId: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    targetEmail: string;
  }): Promise<string> {
    const {
      sourceProvider, targetProvider, sourceToken, targetToken,
      providerFileId, filename, mimeType, sizeBytes, targetEmail,
    } = params;

    try {
      // Jalur utama: share → copy server-side (data tidak lewat worker, hampir instan).
      if (!sourceProvider.shareToUser || !targetProvider.copyFile) {
        throw new Error("Provider tidak mendukung share/copy.");
      }
      await sourceProvider.shareToUser({
        credentials: { accessToken: sourceToken },
        providerFileId,
        email: targetEmail,
      });
      const copied = await targetProvider.copyFile({
        credentials: { accessToken: targetToken },
        providerFileId,
        filename,
      });
      return copied.providerFileId;
    } catch (copyError) {
      // Fallback: streaming download dari sumber → upload ke target lewat worker.
      console.error(
        `Copy server-side gagal untuk file ${providerFileId}, fallback ke streaming:`,
        copyError
      );
      const downloaded = await sourceProvider.download({
        credentials: { accessToken: sourceToken },
        providerFileId,
      });
      const uploaded = await targetProvider.upload({
        credentials: { accessToken: targetToken },
        filename,
        mimeType: downloaded.mimeType || mimeType,
        sizeBytes: downloaded.sizeBytes || sizeBytes,
        stream: downloaded.stream,
      });
      return uploaded.providerFileId;
    }
  }

  private async deleteSourceFile(
    provider: ReturnType<typeof StorageProviderFactory.resolve>,
    sourceToken: string,
    providerFileId: string
  ): Promise<void> {
    try {
      await provider.delete({ credentials: { accessToken: sourceToken }, providerFileId });
    } catch (deleteError) {
      // File sudah aman di target — sisa file di sumber hanya orphan yang bisa
      // dibersihkan lewat Format Drive.
      console.error(`Gagal hapus file sumber ${providerFileId} setelah copy:`, deleteError);
    }
  }

  /** Kalau semua item sudah final, tutup job + sync kuota kedua akun. */
  private async finalizeIfDone(jobId: number): Promise<MigrationJob | null> {
    const remaining = await this.migrationRepository.countRemainingItems(jobId);
    if (remaining > 0) return null;

    await this.migrationRepository.refreshJobCounters(jobId);
    const job = await this.migrationRepository.findById(jobId);
    if (!job || job.status !== "running") return job;

    if (job.migratedFiles === 0 && job.failedFiles > 0) {
      await this.migrationRepository.finishJob(jobId, "failed", "Semua file gagal dimigrasikan.");
    } else {
      await this.migrationRepository.finishJob(jobId, "completed");
    }
    // File yang gagal dipindah (masih di drive sumber) dikembalikan visibility
    // aslinya agar tetap muncul di page download dari lokasi lama.
    await this.migrationRepository.restoreVisibilityForUnfinished(jobId);
    await this.syncQuotas(job.sourceAccountId, job.targetAccountId);
    return (await this.migrationRepository.findById(jobId))!;
  }

  private async syncQuotas(...accountIds: number[]): Promise<void> {
    for (const accountId of accountIds) {
      try {
        const account = await this.driveAccountRepository.findById(accountId);
        if (!account) continue;
        const accessToken = await this.connectionService.getValidAccessToken(account);
        const provider = StorageProviderFactory.resolve(account.provider);
        const quota = await provider.getQuota({ credentials: { accessToken } });
        await this.driveAccountRepository.updateQuota(accountId, quota);
      } catch (error) {
        console.error(`Gagal sync kuota akun ${accountId} setelah migrasi:`, error);
      }
    }
  }
}
