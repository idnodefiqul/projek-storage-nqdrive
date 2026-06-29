import { apiRequest } from "../lib/api-client";

export interface ApiKeyEntry {
  id: number;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export const apiKeyService = {
  list: () => apiRequest<{ apiKeys: ApiKeyEntry[] }>("/api-keys"),
  create: (name: string) => apiRequest<{ apiKey: ApiKeyEntry; fullKey: string }>("/api-keys", { method: "POST", body: { name } }),
  revoke: (id: number) => apiRequest<{ message: string }>(`/api-keys/${id}`, { method: "DELETE" }),
};
