import { DropboxProvider } from "@nqdrive/storage";
import { DriveAccountRepository } from "../database/drive-account.repository";
import { encryptSecret, decryptSecret } from "../utils/encryption";
import {
  exchangeDropboxAuthCode,
  exchangeDropboxRefreshToken,
  fetchDropboxAccountInfo,
} from "./dropbox-oauth.service";
import type { Env } from "../config/env";
import type { DriveAccount } from "@nqdrive/types";

export class DropboxAccountConnectionService {
  private readonly repository: DriveAccountRepository;
  private readonly provider: DropboxProvider;

  constructor(private readonly env: Env) {
    this.repository = new DriveAccountRepository(env.DB);
    this.provider = new DropboxProvider(
      env.DROPBOX_APP_KEY ?? "",
      env.DROPBOX_APP_SECRET ?? ""
    );
  }

  private assertConfigured(): void {
    if (!this.env.DROPBOX_APP_KEY || !this.env.DROPBOX_APP_SECRET) {
      throw new Error("Integrasi Dropbox belum dikonfigurasi (DROPBOX_APP_KEY/SECRET kosong).");
    }
  }

  async connectViaAuthCode(code: string, redirectUri: string): Promise<DriveAccount> {
    this.assertConfigured();
    const result = await exchangeDropboxAuthCode({
      code,
      clientId: this.env.DROPBOX_APP_KEY!,
      clientSecret: this.env.DROPBOX_APP_SECRET!,
      redirectUri,
    });
    return this.persistAccount(result.accessToken, result.refreshToken, result.expiresAt);
  }

  private async persistAccount(
    accessToken: string,
    refreshToken: string,
    expiresAt: string
  ): Promise<DriveAccount> {
    const accountInfo = await fetchDropboxAccountInfo(accessToken);
    const quota = await this.provider.getQuota({ credentials: { accessToken } });
    const refreshTokenEncrypted = await encryptSecret(refreshToken, this.env.ENCRYPTION_KEY);

    const existing = await this.repository.findByEmailAndProvider(accountInfo.email, "dropbox");
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
      provider: "dropbox",
      refreshTokenEncrypted,
      accessToken,
      accessTokenExpiresAt: expiresAt,
      totalStorageBytes: quota.totalBytes,
      usedStorageBytes: quota.usedBytes,
      availableStorageBytes: quota.availableBytes,
    });
  }

  async getValidAccessToken(account: DriveAccount): Promise<string> {
    this.assertConfigured();
    if (!account.refreshTokenEncrypted) {
      throw new Error("FILE_NOT_AVAILABLE");
    }

    const expiresAt = account.accessTokenExpiresAt ? new Date(account.accessTokenExpiresAt) : null;
    const isExpiringSoon = !expiresAt || expiresAt.getTime() - Date.now() < 2 * 60 * 1000;

    if (account.accessToken && !isExpiringSoon) {
      return account.accessToken;
    }

    let refreshToken: string;
    try {
      refreshToken = await decryptSecret(account.refreshTokenEncrypted, this.env.ENCRYPTION_KEY);
    } catch {
      await this.repository.updateStatus(account.id, "offline");
      throw new Error(`Gagal mendekripsi refresh token untuk akun ${account.email}. Akun ditandai offline.`);
    }

    try {
      const refreshed = await exchangeDropboxRefreshToken({
        refreshToken,
        clientId: this.env.DROPBOX_APP_KEY!,
        clientSecret: this.env.DROPBOX_APP_SECRET!,
      });
      await this.repository.updateAccessToken(account.id, refreshed.accessToken, refreshed.expiresAt);
      return refreshed.accessToken;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[dropbox getValidAccessToken] refresh gagal untuk ${account.email}:`, reason);
      await this.repository.updateStatus(account.id, "offline");
      throw new Error(
        `Refresh token untuk akun Dropbox ${account.email} sudah tidak valid. Hubungkan ulang akun.`
      );
    }
  }
}
