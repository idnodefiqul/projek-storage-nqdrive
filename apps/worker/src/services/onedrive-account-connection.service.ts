import { OneDriveProvider } from "@nqdrive/storage";
import { DriveAccountRepository } from "../database/drive-account.repository";
import { encryptSecret, decryptSecret } from "../utils/encryption";
import {
  exchangeOneDriveAuthCode,
  exchangeOneDriveRefreshToken,
  fetchOneDriveAccountInfo,
} from "./onedrive-oauth.service";
import type { Env } from "../config/env";
import type { DriveAccount } from "@nqdrive/types";

export class OneDriveAccountConnectionService {
  private readonly repository: DriveAccountRepository;
  private readonly provider: OneDriveProvider;

  constructor(private readonly env: Env) {
    this.repository = new DriveAccountRepository(env.DB);
    this.provider = new OneDriveProvider(
      env.MICROSOFT_CLIENT_ID ?? "",
      env.MICROSOFT_CLIENT_SECRET ?? ""
    );
  }

  private assertConfigured(): void {
    if (!this.env.MICROSOFT_CLIENT_ID || !this.env.MICROSOFT_CLIENT_SECRET) {
      throw new Error("Integrasi OneDrive belum dikonfigurasi (MICROSOFT_CLIENT_ID/SECRET kosong).");
    }
  }

  async connectViaAuthCode(code: string, redirectUri: string): Promise<DriveAccount> {
    this.assertConfigured();
    const result = await exchangeOneDriveAuthCode({
      code,
      clientId: this.env.MICROSOFT_CLIENT_ID!,
      clientSecret: this.env.MICROSOFT_CLIENT_SECRET!,
      redirectUri,
    });
    return this.persistAccount(result.accessToken, result.refreshToken, result.expiresAt);
  }

  private async persistAccount(
    accessToken: string,
    refreshToken: string,
    expiresAt: string
  ): Promise<DriveAccount> {
    const accountInfo = await fetchOneDriveAccountInfo(accessToken);
    let quota = await this.provider.getQuota({ credentials: { accessToken } });
    const refreshTokenEncrypted = await encryptSecret(refreshToken, this.env.ENCRYPTION_KEY);

    const existing = await this.repository.findByEmailAndProvider(accountInfo.email, "onedrive");

    if (quota.usedBytes === 0) {
      let resolvedUsed = 0;
      if (existing) {
        const dbUsed = await this.getUsedBytesFromDb(existing.id);
        if (dbUsed > 0) resolvedUsed = Math.max(resolvedUsed, dbUsed);
      }
      try {
        const listedUsed = await this.provider.getUsedBytesByListing({ credentials: { accessToken } });
        if (listedUsed > 0) resolvedUsed = Math.max(resolvedUsed, listedUsed);
      } catch {}
      if (resolvedUsed > 0) {
        quota = {
          ...quota,
          usedBytes: resolvedUsed,
          availableBytes: quota.totalBytes > 0 ? Math.max(0, quota.totalBytes - resolvedUsed) : quota.availableBytes,
        };
      }
    }

    if (quota.totalBytes === 0 && quota.usedBytes > 0) {
      const DEFAULT = 5 * 1024 * 1024 * 1024;
      quota = {
        totalBytes: Math.max(DEFAULT, quota.usedBytes),
        usedBytes: quota.usedBytes,
        availableBytes: Math.max(0, DEFAULT - quota.usedBytes),
      };
    }

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
      provider: "onedrive",
      refreshTokenEncrypted,
      accessToken,
      accessTokenExpiresAt: expiresAt,
      totalStorageBytes: quota.totalBytes,
      usedStorageBytes: quota.usedBytes,
      availableStorageBytes: quota.availableBytes,
    });
  }

  private async getUsedBytesFromDb(accountId: number): Promise<number> {
    try {
      const row = await this.env.DB.prepare(
        "SELECT COALESCE(SUM(size_bytes), 0) as total FROM files WHERE drive_account_id = ? AND deleted_at IS NULL"
      ).bind(accountId).first<{ total: number }>();
      return row?.total ?? 0;
    } catch {
      return 0;
    }
  }

  async getValidAccessToken(account: DriveAccount): Promise<string> {
    this.assertConfigured();
    if (!account.refreshTokenEncrypted) throw new Error("FILE_NOT_AVAILABLE");

    const expiresAt = account.accessTokenExpiresAt ? new Date(account.accessTokenExpiresAt) : null;
    const isExpiringSoon = !expiresAt || expiresAt.getTime() - Date.now() < 2 * 60 * 1000;

    if (account.accessToken && !isExpiringSoon) return account.accessToken;

    let refreshToken: string;
    try {
      refreshToken = await decryptSecret(account.refreshTokenEncrypted, this.env.ENCRYPTION_KEY);
    } catch {
      await this.repository.updateStatus(account.id, "offline");
      throw new Error(`Gagal mendekripsi refresh token untuk akun ${account.email}.`);
    }

    try {
      const refreshed = await exchangeOneDriveRefreshToken({
        refreshToken,
        clientId: this.env.MICROSOFT_CLIENT_ID!,
        clientSecret: this.env.MICROSOFT_CLIENT_SECRET!,
      });
      await this.repository.updateAccessToken(account.id, refreshed.accessToken, refreshed.expiresAt);
      return refreshed.accessToken;
    } catch (err) {
      console.error(`[onedrive getValidAccessToken] refresh gagal untuk ${account.email}:`, err);
      await this.repository.updateStatus(account.id, "offline");
      throw new Error(`Refresh token untuk akun OneDrive ${account.email} sudah tidak valid.`);
    }
  }
}
