import { apiRequest } from "../lib/client";

export interface SiteSettings {
  download_endpoint: string;
  avatar_style: string;
  avatar_seed: string;
  brand_color: string;
  theme_mode: string;
  rate_limit_login?: string;
  block_cli_download?: string;
  rate_limit_download?: string;
  turnstile_enabled?: string;
  turnstile_sitekey?: string;
  turnstile_secretkey?: string;
}

/**
 * Fetch all settings (authenticated — for dashboard use).
 */
export function getSettings(): Promise<SiteSettings> {
  return apiRequest<SiteSettings>("/settings");
}

/**
 * Update one or more settings (authenticated).
 */
export function updateSettings(updates: Partial<SiteSettings>): Promise<{ updated: string[] }> {
  return apiRequest<{ updated: string[] }>("/settings", {
    method: "PATCH",
    body: updates,
  });
}

/**
 * Map a download_endpoint value to a human-readable label.
 */
export function formatEndpointName(endpoint: string): string {
  if (endpoint === "default") return "/:shareCode/:filename.ext/download";
  if (endpoint === "download") return "/:shareCode/download/:filename.ext";
  if (endpoint === "dl") return "/:shareCode/dl/:filename.ext";
  if (endpoint === "get") return "/:shareCode/get/:filename.ext";
  if (endpoint === "query") return "/:shareCode/:filename.ext?download";
  if (endpoint.startsWith("custom:")) return `/:shareCode/${endpoint.slice(7)}/:filename.ext`;
  return endpoint;
}

/**
 * Build a download URL path from a filename and endpoint setting value.
 */
export function buildDownloadPath(filename: string, shareCode: string, endpoint: string): string {
  if (endpoint === "download") return `/${shareCode}/download/${filename}`;
  if (endpoint === "dl") return `/${shareCode}/dl/${filename}`;
  if (endpoint === "get") return `/${shareCode}/get/${filename}`;
  if (endpoint === "query") return `/${shareCode}/${filename}?download`;
  if (endpoint.startsWith("custom:")) return `/${shareCode}/${endpoint.slice(7)}/${filename}`;
  return `/${shareCode}/${filename}/download`;
}
