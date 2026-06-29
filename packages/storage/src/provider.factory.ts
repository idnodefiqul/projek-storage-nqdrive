import type { StorageProviderType } from "@nqdrive/types";
import type { StorageProvider } from "./provider.interface";

/**
 * Factory & registry for StorageProvider implementations.
 *
 * Design rationale:
 * The rest of the codebase (upload service, download handler, storage manager) must never
 * import a concrete provider class directly — it always asks this factory for "the provider
 * for type X". This keeps the dependency direction pointed at the interface (Dependency
 * Inversion Principle) and means new providers are added by registering them here once,
 * during application bootstrap — no other file needs to change.
 */
export class StorageProviderFactory {
  private static readonly registry = new Map<StorageProviderType, StorageProvider>();

  /** Registers a provider implementation. Call once per provider during app startup. */
  static register(provider: StorageProvider): void {
    this.registry.set(provider.type, provider);
  }

  /** Resolves the provider implementation for a given type. Throws if not registered. */
  static resolve(type: StorageProviderType): StorageProvider {
    const provider = this.registry.get(type);
    if (!provider) {
      throw new Error(
        `Storage provider "${type}" is not registered. Did you forget to register it during bootstrap?`
      );
    }
    return provider;
  }

  /** Returns all currently registered provider types — useful for the "Add Account" UI dropdown. */
  static listRegisteredTypes(): StorageProviderType[] {
    return Array.from(this.registry.keys());
  }

  /** Mainly for test isolation. */
  static clear(): void {
    this.registry.clear();
  }
}
