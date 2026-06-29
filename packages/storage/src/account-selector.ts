import type { DriveAccount } from "@nqdrive/types";

/**
 * Selects the best drive account to receive a new upload of the given size.
 *
 * Strategy: pick the account with the largest available space that can still fit the file,
 * among accounts that are currently online. This spreads load evenly across accounts and
 * avoids picking a near-full account just because it happens to be first in the list.
 */
export function selectBestDriveAccount(
  accounts: DriveAccount[],
  requiredBytes: number
): DriveAccount | null {
  const eligible = accounts.filter(
    (account) => account.status === "online" && account.availableStorageBytes >= requiredBytes
  );

  if (eligible.length === 0) return null;

  return eligible.reduce((best, current) =>
    current.availableStorageBytes > best.availableStorageBytes ? current : best
  );
}
