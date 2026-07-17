import { GoogleDriveProvider } from "@nqdrive/storage";
import { DriveAccountRepository } from "../database/drive-account.repository";
import { encryptSecret, decryptSecret } from "../utils/encryption";
import { exchangeRefreshToken, exchangeAuthCode, fetchGoogleAccountInfo } from "./google-oauth.service";
import type { Env } from "../config/env";
import type { DriveAccount } from "@nqdrive/types";

/**
 * Orchestrates penambahan Google Drive account. Dua jalur, keduanya berujung di
 * persistAccount() yang menyimpan akun + refresh token terenkripsi ke D1:
 *
 *   A. connectViaAuthCode      (DIREKOMENDASIKAN) — dari OAuth consent flow.
 *      Refresh token didapat otomatis saat menukar authorization code.
 *   B. connectViaRefreshToken  (fallback) — admin paste refresh token manual.
 */
export class GoogleAccountConnectionService {
  private readonly repository: DriveAccountRepository;
  private readonly provider: GoogleDriveProvider;

  constructor(private readonly env: Env) {
    this.repository = new DriveAccountRepository(env.DB);
    this.provider = new GoogleDriveProvider(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
  }

  /**
   * Fallback: tambahkan akun via refresh token yang di-paste manual.
   * Throws dengan pesan user-friendly jika token tidak valid, sudah dipakai, atau tidak punya scope drive.
   */
  async connectViaRefreshToken(refreshToken: string): Promise<DriveAccount> {
    const cleanToken = refreshToken.trim();
    if (!cleanToken) {
      throw new Error("Refresh token tidak boleh kosong.");
    }

    if (cleanToken.length < 20 || cleanToken.length > 512) {
      throw new Error("Format refresh token tidak valid.");
    }

    const tokens = await exchangeRefreshToken({
      refreshToken: cleanToken,
      clientId: this.env.GOOGLE_CLIENT_ID,
      clientSecret: this.env.GOOGLE_CLIENT_SECRET,
    });

    return this.persistAccount(tokens.accessToken, cleanToken, tokens.expiresAt);
  }

  async connectViaAuthCode(code: string, redirectUri: string): Promise<DriveAccount> {
    const result = await exchangeAuthCode({
      code,
      clientId: this.env.GOOGLE_CLIENT_ID,
      clientSecret: this.env.GOOGLE_CLIENT_SECRET,
      redirectUri,
    });

    return this.persistAccount(result.accessToken, result.refreshToken, result.expiresAt);
  }

  private async persistAccount(
    accessToken: string,
    refreshToken: string,
    expiresAt: string
  ): Promise<DriveAccount> {
    const accountInfo = await fetchGoogleAccountInfo(accessToken);

    const quota = await this.provider.getQuota({
      credentials: { accessToken },
    });

    const refreshTokenEncrypted = await encryptSecret(refreshToken, this.env.ENCRYPTION_KEY);

    const existing = await this.repository.findByEmailAndProvider(accountInfo.email, "google_drive");
    if (existing) {
      return this.repository.reconnect(existing.id, {
        refreshTokenEncrypted,
        accessToken,
        accessTokenExpiresAt: expiresAt,
        totalStorageBytes: quota.totalBytes,
        usedStorageBytes: quota.usedBytes,
        availableStorageBytes: quota.availableBytes,
      });
    }

    return this.repository.create({
      email: accountInfo.email,
      provider: "google_drive",
      refreshTokenEncrypted,
      accessToken,
      accessTokenExpiresAt: expiresAt,
      totalStorageBytes: quota.totalBytes,
      usedStorageBytes: quota.usedBytes,
      availableStorageBytes: quota.availableBytes,
    });
  }

  /**
   * Kembalikan access token yang masih valid untuk akun tertentu.
   * Refresh otomatis jika expired / akan expired dalam 2 menit.
   * SECURITY: error refresh token yang gagal menandai akun sebagai offline.
   */
  async getValidAccessToken(account: DriveAccount): Promise<string> {
    if (!account.refreshTokenEncrypted) {
      throw new Error("FILE_NOT_AVAILABLE");
    }

    const expiresAt = account.accessTokenExpiresAt ? new Date(account.accessTokenExpiresAt) : null;
    const isExpiringSoon = !expiresAt || expiresAt.getTime() - Date.now() < 2 * 60 * 1000;

    if (account.accessToken && !isExpiringSoon) {
      return account.accessToken;
    }

    // Decrypt refresh token dan request access token baru
    let refreshToken: string;
    try {
      refreshToken = await decryptSecret(account.refreshTokenEncrypted, this.env.ENCRYPTION_KEY);
    } catch {
      // Tandai akun offline jika decryption gagal (misal ENCRYPTION_KEY berubah)
      await this.repository.updateStatus(account.id, "offline");
      throw new Error(`Gagal mendekripsi refresh token untuk akun ${account.email}. Akun ditandai offline.`);
    }

    try {
      const refreshed = await this.provider.refreshAccessToken({ refreshToken });
      await this.repository.updateAccessToken(account.id, refreshed.accessToken, refreshed.expiresAt);
      return refreshed.accessToken;
    } catch (err) {
      // Log alasan ASLI dari Google (invalid_grant vs invalid_client) — ini krusial untuk
      // membedakan "token dicabut/expired" (invalid_grant) dari "client_id/secret salah"
      // (invalid_client). Tanpa ini, dua masalah yang sangat berbeda terlihat identik.
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[getValidAccessToken] refresh gagal untuk ${account.email}:`, reason);

      // Tandai akun offline jika refresh token sudah tidak valid (dicabut / expired)
      await this.repository.updateStatus(account.id, "offline");
      throw new Error(
        `Refresh token untuk akun ${account.email} sudah tidak valid. ` +
        "Hapus akun dan tambahkan ulang dengan refresh token baru."
      );
    }
  }
}
