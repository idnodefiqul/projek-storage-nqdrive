import type { Env } from "../config/env";
import type { DriveAccount } from "@nqdrive/types";
import { GoogleAccountConnectionService } from "../services/google-account-connection.service";
import { DropboxAccountConnectionService } from "../services/dropbox-account-connection.service";
import { OneDriveAccountConnectionService } from "../services/onedrive-account-connection.service";

export interface ResolvedCredentials {
  accessToken?: string;
  [key: string]: string | undefined;
}

/**
 * Resolves credentials for any storage provider, automatically decrypting
 * from D1 database and handling token refresh if needed.
 */
export async function resolveCredentials(
  account: DriveAccount,
  env: Env
): Promise<ResolvedCredentials> {
  if (account.provider === "google_drive") {
    const googleService = new GoogleAccountConnectionService(env);
    const accessToken = await googleService.getValidAccessToken(account);
    return { accessToken };
  }

  if (account.provider === "dropbox") {
    const dropboxService = new DropboxAccountConnectionService(env);
    const accessToken = await dropboxService.getValidAccessToken(account);
    return { accessToken };
  }

  if (account.provider === "onedrive") {
    const oneDriveService = new OneDriveAccountConnectionService(env);
    const accessToken = await oneDriveService.getValidAccessToken(account);
    return { accessToken };
  }

  throw new Error(`Unsupported storage provider: ${account.provider}`);
}
