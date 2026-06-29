import { GoogleDriveProvider } from "@nqdrive/storage";
import { DriveAccountRepository } from "../database/drive-account.repository";
import { encryptSecret, decryptSecret } from "../utils/encryption";
import { exchangeRefreshToken, fetchGoogleAccountInfo } from "./google-oauth.service";
import type { Env } from "../config/env";
import type { DriveAccount } from "@nqdrive/types";

/**
 * Orchestrates penambahan Google Drive account via refresh token langsung.
 *
 * Flow baru (tanpa consent screen):
 *   1. Admin paste refresh token di form dashboard
 *   2. POST /api/storage/accounts/connect  -> service ini dipanggil
 *   3. Tukar refresh token -> access token (validate token valid & punya drive scope)
 *   4. Fetch email akun dari userinfo
 *   5. Cek duplikat, fetch quota, encrypt refresh token, simpan ke D1
 *
 * Flow OAuth lama (redirect -> callback) DIHAPUS sepenuhnya.
 */
export class GoogleAccountConnectionService {
  private readonly repository: DriveAccountRepository;
  private readonly provider: GoogleDriveProvider;

  constructor(private readonly env: Env) {
    this.repository = new DriveAccountRepository(env.DB);
    this.provider = new GoogleDriveProvider(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
  }

  /**
   * Tambahkan akun Google Drive via refresh token.
   * Throws dengan pesan user-friendly jika token tidak valid, sudah dipakai, atau tidak punya scope drive.
   */
  async connectViaRefreshToken(refreshToken: string): Promise<DriveAccount> {
    // Sanitasi: pastikan input adalah string non-kosong
    const cleanToken = refreshToken.trim();
    if (!cleanToken) {
      throw new Error("Refresh token tidak boleh kosong.");
    }

    // Panjang refresh token Google biasanya 100+ karakter — sanity check
    if (cleanToken.length < 20 || cleanToken.length > 512) {
      throw new Error("Format refresh token tidak valid.");
    }

    // Tukar refresh token -> access token (juga memvalidasi bahwa token masih aktif)
    const tokens = await exchangeRefreshToken({
      refreshToken: cleanToken,
      clientId: this.env.GOOGLE_CLIENT_ID,
      clientSecret: this.env.GOOGLE_CLIENT_SECRET,
    });

    // Fetch email + validasi drive scope
    const accountInfo = await fetchGoogleAccountInfo(tokens.accessToken);

    // Cek duplikat berdasarkan email
    const existing = await this.repository.findByEmail(accountInfo.email);
    if (existing) {
      throw new Error(`Akun Google Drive "${accountInfo.email}" sudah terhubung sebelumnya.`);
    }

    // Fetch quota Drive
    const quota = await this.provider.getQuota({
      credentials: { accessToken: tokens.accessToken },
    });

    // Encrypt refresh token sebelum disimpan ke D1
    const refreshTokenEncrypted = await encryptSecret(cleanToken, this.env.ENCRYPTION_KEY);

    return this.repository.create({
      email: accountInfo.email,
      provider: "google_drive",
      refreshTokenEncrypted,
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: tokens.expiresAt,
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
      // Tandai akun offline jika refresh token sudah tidak valid (dicabut / expired)
      await this.repository.updateStatus(account.id, "offline");
      throw new Error(
        `Refresh token untuk akun ${account.email} sudah tidak valid. ` +
        "Hapus akun dan tambahkan ulang dengan refresh token baru."
      );
    }
  }
}
