import type { Env } from "../config/env";
import { FileRepository } from "../database/file.repository";
import { DriveAccountRepository } from "../database/drive-account.repository";
import { GoogleAccountConnectionService } from "../services/google-account-connection.service";
import { StorageProviderFactory } from "@nqdrive/storage";

const TRASH_RETENTION_DAYS = 30;

/**
 * Cron job: Purge item Trash yang sudah lebih dari 30 hari.
 * Dipanggil bersamaan dengan syncDriveAccounts di scheduled handler.
 *
 * Urutan operasi per file:
 * 1. Hapus file fisik dari Google Drive (provider.delete)
 * 2. Hapus baris dari DB (fileRepository.delete)
 *
 * Jika provider delete gagal (e.g. token expired, file sudah hilang di GDrive),
 * tetap lanjut hapus dari DB agar tidak menghalangi purge item lain.
 */
export async function purgeExpiredTrash(env: Env): Promise<void> {
  const fileRepository = new FileRepository(env.DB);
  const driveAccountRepository = new DriveAccountRepository(env.DB);
  const connectionService = new GoogleAccountConnectionService(env);

  const expiredFiles = await fileRepository.findExpiredTrash(TRASH_RETENTION_DAYS);

  if (expiredFiles.length === 0) {
    console.log("[purgeExpiredTrash] Tidak ada item Trash yang kadaluarsa.");
    return;
  }

  console.log(`[purgeExpiredTrash] Memproses ${expiredFiles.length} file kadaluarsa dari Trash...`);

  let deletedCount = 0;
  let errorCount = 0;

  for (const file of expiredFiles) {
    try {
      const account = await driveAccountRepository.findById(file.driveAccountId);
      if (account) {
        const accessToken = await connectionService.getValidAccessToken(account);
        const provider = StorageProviderFactory.resolve(account.provider);
        await provider.delete({ credentials: { accessToken }, providerFileId: file.providerFileId });
      }
    } catch (err) {
      console.error(`[purgeExpiredTrash] Gagal hapus file ${file.id} dari provider:`, err);
      errorCount++;
    }

    // Selalu hapus dari DB meski provider gagal
    await fileRepository.delete(file.id);
    deletedCount++;
  }

  // Purge folder yang kadaluarsa dari Trash juga (hanya hapus dari DB, file sudah di-handle di atas)
  const { results: expiredFolders } = await env.DB
    .prepare(
      `SELECT id FROM folders
       WHERE deleted_at IS NOT NULL
         AND deleted_at < datetime('now', '-' || ? || ' days')`
    )
    .bind(TRASH_RETENTION_DAYS)
    .all<{ id: number }>();

  for (const folder of expiredFolders) {
    try {
      await env.DB.prepare("DELETE FROM folders WHERE id = ?").bind(folder.id).run();
    } catch (err) {
      console.error(`[purgeExpiredTrash] Gagal hapus folder ${folder.id} dari DB:`, err);
    }
  }

  console.log(
    `[purgeExpiredTrash] Selesai. Dihapus: ${deletedCount} file, ${expiredFolders.length} folder. Error: ${errorCount}.`
  );
}
