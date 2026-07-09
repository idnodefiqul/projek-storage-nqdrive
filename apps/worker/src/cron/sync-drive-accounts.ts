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
 * Each account is processed independently — one account failing (e.g. revoked access)
 * must never prevent the others from syncing.
 */
export async function syncDriveAccounts(env: Env): Promise<void> {
  const repository = new DriveAccountRepository(env.DB);

  const accounts = await repository.findAll();

  for (const account of accounts) {
    try {
      const credentials = await resolveCredentials(account, env);
      const provider = StorageProviderFactory.resolve(account.provider);

      const quota = await provider.getQuota({ credentials: credentials as any });

      await repository.updateQuota(account.id, quota);
      await repository.updateStatus(account.id, "online");
    } catch (error) {
      console.error(`[cron] Failed to sync drive account ${account.id} (${account.email}):`, error);
      await repository.updateStatus(account.id, "error");
    }
  }
}
