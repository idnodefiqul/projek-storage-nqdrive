import { apiRequest } from "../lib/client";
import type { PublicDriveAccount } from "@nqdrive/types";

export type DriveAccountWithFileCount = PublicDriveAccount & { fileCount: number };

export const driveAccountService = {
  list: (signal?: AbortSignal) =>
    apiRequest<{ accounts: DriveAccountWithFileCount[] }>("/storage/accounts", { signal }),

  remove: (id: number) =>
    apiRequest<{ message: string }>(`/storage/accounts/${id}`, { method: "DELETE" }),

  format: (id: number) =>
    apiRequest<{ message: string; accountId: number; email: string; deletedFiles: number }>(`/storage/accounts/${id}/format`, { method: "POST" }),

  formatAll: () =>
    apiRequest<{
      message: string;
      totalDeletedFiles: number;
      results: Array<{ accountId: number; email: string; deletedFiles: number; status: "ok" | "error"; error?: string }>;
    }>("/storage/accounts/format-all", { method: "POST" }),
};

export const googleDriveService = {
  /**
   * Ambil URL OAuth consent (cara login yang direkomendasikan).
   * `provider` menentukan Google Drive atau Dropbox — endpoint yang sama menerbitkan
   * URL yang sesuai. Frontend melakukan window.location ke URL ini; setelah admin
   * mengizinkan, provider redirect ke worker callback yang menyimpan akun otomatis.
   */
  getOAuthUrl: (provider: "google_drive" | "dropbox" | "onedrive" = "google_drive") =>
    apiRequest<{ url: string }>(`/storage/accounts/oauth/url?provider=${provider}`),

  /**
   * Tambahkan akun Google Drive via refresh token.
   * FIX: body dikirim sebagai object, bukan JSON.stringify manual
   * (apiRequest sudah handle JSON.stringify di dalamnya).
   */
  connectViaRefreshToken: (refreshToken: string) =>
    apiRequest<{ account: PublicDriveAccount }>("/storage/accounts/connect", {
      method: "POST",
      body: { refreshToken },
    }),

  /**
   * Validasi refresh token tanpa menyimpannya.
   * FIX: sama — body sebagai object biasa.
   */
  validateRefreshToken: (refreshToken: string) =>
    apiRequest<{ valid: boolean; email?: string; reason?: string }>(
      "/storage/accounts/validate",
      {
        method: "POST",
        body: { refreshToken },
      }
    ),
};

export const dropboxService = {
  getOAuthUrl: () => googleDriveService.getOAuthUrl("dropbox"),
};

export const oneDriveService = {
  getOAuthUrl: () => googleDriveService.getOAuthUrl("onedrive"),
};
