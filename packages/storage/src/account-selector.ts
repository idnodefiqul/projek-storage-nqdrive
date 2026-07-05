import type { DriveAccount } from "@nqdrive/types";

const RESERVE_BYTES = 1 * 1024 * 1024 * 1024; // 1 GB

export function selectBestDriveAccount(
  accounts: DriveAccount[],
  requiredBytes: number
): DriveAccount | null {
  const eligible = accounts.filter(
    (account) =>
      account.status === "online" &&
      account.availableStorageBytes >= requiredBytes + RESERVE_BYTES
  );

  if (eligible.length === 0) return null;

  return eligible.reduce((best, current) =>
    current.availableStorageBytes > best.availableStorageBytes ? current : best
  );
}
