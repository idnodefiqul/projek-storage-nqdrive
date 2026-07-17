import { StorageProviderFactory } from "@nqdrive/storage";
import { DriveAccountRepository } from "../database/drive-account.repository";
import { resolveCredentials } from "../utils/credentials";
import type { Env } from "../config/env";

/**
 * Runs every 10 minutes (see wrangler.jsonc "triggers.crons"). For each connected drive
 * account:
 *   1. Resolve credentials via `resolveCredentials` which handles Google Drive
 *      (refresh token → access token).
 *   2. Re-sync quota figures from the provider, since usedStorageBytes is only updated
 *      optimistically after uploads (Tahap 6) and can drift from the provider's true value
 *      (e.g. if the admin deleted files directly in Google Drive's own UI).
 *   3. Update the account's status based on whether the sync succeeded.
 *
 *   OneDrive special handling:
 *   - Microsoft Graph API sering used=0 karena eventual consistency / permission.
 *   - Jika API used=0 tapi DB punya file, pakai DB SUM.
 *   - Jika API used < DB SUM, pakai max(DB, API) — prevents 0-byte after reconnect.
 *   - Total yang dipakai = API total jika valid, fallback ke existing DB total atau 5GB default.
 *
 * Each account is processed independently — one account failing (e.g. revoked access)
 * must never prevent the others from syncing.
 */
export async function syncDriveAccounts(env: Env): Promise<void> {
  const repository = new DriveAccountRepository(env.DB);

  const accounts = await repository.findAll();

  for (const account of accounts) {
    // Skip akun yang sudah disconnect (token kosong) — jangan tandai error
    if (!account.refreshTokenEncrypted) {
      continue;
    }
    try {
      const credentials = await resolveCredentials(account, env);
      const provider = StorageProviderFactory.resolve(account.provider);

      let quota = await provider.getQuota({ credentials: credentials as any });

      // OneDrive-specific robust reconciliation
      if (account.provider === "onedrive") {
        const dbRow = await env.DB.prepare(
          "SELECT COALESCE(SUM(size_bytes), 0) as total FROM files WHERE drive_account_id = ? AND deleted_at IS NULL"
        ).bind(account.id).first<{ total: number }>();
        const dbUsed = dbRow?.total ?? 0;

        // Jika API total=0 tapi kita punya existing total di DB, pertahankan.
        if (quota.totalBytes === 0 && account.totalStorageBytes > 0) {
          quota = { ...quota, totalBytes: account.totalStorageBytes, availableBytes: Math.max(0, account.totalStorageBytes - quota.usedBytes) };
        }
        // Jika API total=0 dan DB total juga 0, pakai default 5GB free OneDrive
        if (quota.totalBytes === 0) {
          const DEFAULT_ONEDRIVE_FREE = 5 * 1024 * 1024 * 1024;
          quota = { ...quota, totalBytes: Math.max(DEFAULT_ONEDRIVE_FREE, dbUsed), availableBytes: Math.max(0, DEFAULT_ONEDRIVE_FREE - Math.max(dbUsed, quota.usedBytes)) };
        }

        // Jika API used=0 atau API used < DB sum → API tidak akurat, pakai DB
        if (dbUsed > 0) {
          if (quota.usedBytes === 0 || quota.usedBytes < dbUsed) {
            console.log(`[cron OneDrive sync] account ${account.id}: API used=${quota.usedBytes} < DB used=${dbUsed}, pakai DB.`);
            quota = { ...quota, usedBytes: dbUsed, availableBytes: Math.max(0, quota.totalBytes - dbUsed) };
          }
        }

        // Jika masih used=0 dan DB juga 0, coba listing langsung sebagai last resort
        // (hanya jika file count di DB 0 tapi totalBytes API >0 — artinya file ada di OneDrive tapi tidak di DB)
        if (quota.usedBytes === 0 && dbUsed === 0) {
          try {
            const oneDriveProvider = provider as any;
            if (oneDriveProvider.getUsedBytesByListing) {
              const listedUsed = await oneDriveProvider.getUsedBytesByListing({ credentials: credentials as any });
              if (listedUsed > 0) {
                console.log(`[cron OneDrive sync] account ${account.id}: API & DB used=0, listing=${listedUsed}, pakai listing.`);
                quota = { ...quota, usedBytes: listedUsed, availableBytes: Math.max(0, quota.totalBytes - listedUsed) };
              }
            }
          } catch (err) {
            console.error(`[cron OneDrive sync] listing fallback gagal untuk account ${account.id}:`, err);
          }
        }
      }

      await repository.updateQuota(account.id, quota);
      await repository.updateStatus(account.id, "online");
    } catch (error) {
      console.error(`[cron] Failed to sync drive account ${account.id} (${account.email}):`, error);
      await repository.updateStatus(account.id, "error");
    }
  }
}
