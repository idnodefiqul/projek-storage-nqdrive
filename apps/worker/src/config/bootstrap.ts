import { StorageProviderFactory, GoogleDriveProvider, DropboxProvider, OneDriveProvider } from "@nqdrive/storage";
import type { Env } from "./env";

let providersInitialized = false;

export function registerStorageProviders(env: Env): void {
  // Idempotent registration — only register once per isolate lifecycle
  // Workers isolate persists across requests, so we avoid re-registering on every request
  if (providersInitialized && StorageProviderFactory.isInitialized()) {
    return;
  }

  // Always register Google Drive (required)
  try {
    StorageProviderFactory.register(new GoogleDriveProvider(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET));
  } catch (e) {
    console.warn("Failed to register GoogleDriveProvider:", e);
  }

  if (env.DROPBOX_APP_KEY && env.DROPBOX_APP_SECRET) {
    try {
      StorageProviderFactory.register(new DropboxProvider(env.DROPBOX_APP_KEY, env.DROPBOX_APP_SECRET));
    } catch (e) {
      console.warn("Failed to register DropboxProvider:", e);
    }
  }

  if (env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) {
    try {
      StorageProviderFactory.register(new OneDriveProvider(env.MICROSOFT_CLIENT_ID, env.MICROSOFT_CLIENT_SECRET));
    } catch (e) {
      console.warn("Failed to register OneDriveProvider:", e);
    }
  }

  providersInitialized = true;
  StorageProviderFactory.markInitialized();
}
