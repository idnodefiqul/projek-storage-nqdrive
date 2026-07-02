import { apiRequest } from "../lib/client";
import type { PublicDriveAccount } from "@nqdrive/types";

export const driveAccountService = {
  list: () => apiRequest<{ accounts: PublicDriveAccount[] }>("/storage/accounts"),

  remove: (id: number) =>
    apiRequest<{ message: string }>(`/storage/accounts/${id}`, { method: "DELETE" }),
};

export const googleDriveService = {
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
