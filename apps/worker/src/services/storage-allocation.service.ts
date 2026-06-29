import { selectBestDriveAccount } from "@nqdrive/storage";
import { DriveAccountRepository } from "../database/drive-account.repository";
import type { DriveAccount } from "@nqdrive/types";

/**
 * Thin wrapper around the pure `selectBestDriveAccount` function from @nqdrive/storage,
 * fetching live account data from D1 first. Kept separate from the pure function so that
 * the selection algorithm itself (in packages/storage) stays unit-testable without a database.
 */
export class StorageAllocationService {
  private readonly repository: DriveAccountRepository;

  constructor(db: D1Database) {
    this.repository = new DriveAccountRepository(db);
  }

  /**
   * Picks the best online account to receive a new upload of the given size.
   * Returns null if no account currently has enough free space.
   */
  async pickAccountForUpload(requiredBytes: number): Promise<DriveAccount | null> {
    const onlineAccounts = await this.repository.findOnline();
    return selectBestDriveAccount(onlineAccounts, requiredBytes);
  }
}
