import { StorageProviderFactory, GoogleDriveProvider } from "@nqdrive/storage";
import type { Env } from "./env";

/**
 * Registers every active StorageProvider implementation with the factory.
 *
 * Call this once per request at the top of the Hono app (or once per Worker isolate —
 * registration is idempotent since it just overwrites the map entry). Adding a new
 * provider later (R2, S3, B2, ...) means adding one line here — nothing else in the
 * codebase needs to change, since all callers resolve providers through the factory.
 */
export function registerStorageProviders(env: Env): void {
  StorageProviderFactory.register(new GoogleDriveProvider(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET));

  // Future providers, registered the same way once implemented:
  // StorageProviderFactory.register(new CloudflareR2Provider(...));
  // StorageProviderFactory.register(new AmazonS3Provider(...));
  // StorageProviderFactory.register(new BackblazeB2Provider(...));
}
