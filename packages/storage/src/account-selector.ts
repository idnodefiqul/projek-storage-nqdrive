import type { DriveAccount, StorageProviderType } from "@nqdrive/types";

// Cadangan ruang kosong yang selalu disisakan per akun (tidak boleh dipakai upload).
const DEFAULT_RESERVE_BYTES = 1 * 1024 * 1024 * 1024; // 1 GB (Google Drive dll.)
const DROPBOX_RESERVE_BYTES = 300 * 1024 * 1024; // 300 MB — Dropbox free hanya 2 GB/user.

/**
 * Cadangan ruang minimum yang disisakan untuk akun sesuai provider-nya.
 * Dropbox (kuota kecil) hanya menyisakan 300 MB; provider lain 1 GB.
 * Dipakai bersama frontend agar deteksi "cukup / tidak" konsisten di dua sisi.
 */
export function reserveBytesForProvider(provider: StorageProviderType): number {
  return provider === "dropbox" ? DROPBOX_RESERVE_BYTES : DEFAULT_RESERVE_BYTES;
}

/** Apakah akun punya ruang cukup untuk file `requiredBytes` (sudah termasuk cadangan)? */
export function accountHasSpaceFor(account: DriveAccount, requiredBytes: number): boolean {
  return account.availableStorageBytes >= requiredBytes + reserveBytesForProvider(account.provider);
}

export function selectBestDriveAccount(
  accounts: DriveAccount[],
  requiredBytes: number
): DriveAccount | null {
  const eligible = accounts.filter(
    (account) => account.status === "online" && accountHasSpaceFor(account, requiredBytes)
  );

  if (eligible.length === 0) return null;

  return eligible.reduce((best, current) =>
    current.availableStorageBytes > best.availableStorageBytes ? current : best
  );
}
