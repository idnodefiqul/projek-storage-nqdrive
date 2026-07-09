import type { Env } from "../config/env";
import type { DriveAccount } from "@nqdrive/types";
import { GoogleAccountConnectionService } from "../services/google-account-connection.service";

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

  throw new Error(`Unsupported storage provider: ${account.provider}`);
}
