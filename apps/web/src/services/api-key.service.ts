import { apiRequest } from "../lib/client";

export interface ApiKeyEntry {
  apiKeyId: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export const apiKeyService = {
  list: () => apiRequest<{ apiKeys: ApiKeyEntry[] }>("/api-keys"),
  create: (name: string) => apiRequest<{ apiKey: ApiKeyEntry; fullKey: string }>("/api-keys", { method: "POST", body: { name } }),
  revoke: (id: string) => apiRequest<{ message: string }>(`/api-keys/${id}`, { method: "DELETE" }),
};
