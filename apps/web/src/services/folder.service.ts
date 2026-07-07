import { apiRequest } from "../lib/client";
import type { Folder, FolderByPathResponse } from "@nqdrive/types";

export const folderService = {
  /**
   * List folders by parentFolderId (internal — used when you already have an ID).
   * Prefer byPath() for user-facing navigation.
   */
  list: (parentFolderId: number | null = null) =>
    apiRequest<{ folders: Folder[] }>(
      parentFolderId !== null ? `/folders?parentFolderId=${parentFolderId}` : "/folders"
    ),

  /**
   * Resolve a slash-separated path ke folder data + children.
   *
   * Format URL: /api/folders/resolve?folder=Windows/11
   *
   * "/" dikirim sebagai literal — tidak di-encode jadi %2F.
   * Encoding karakter khusus lain (spasi → %20, dll) tetap dilakukan
   * via encodeURIComponent per segment.
   *
   * byPath("") → root
   * byPath("Scripts") → folder Scripts
   * byPath("Windows/11") → subfolder 11 di dalam Windows
   * byPath("A/B/C/D") → nested 4 level dalam
   */
  byPath: (path: string) => {
    if (!path) {
      return apiRequest<FolderByPathResponse>("/folders/resolve");
    }
    // Encode setiap segment secara individual (handle spasi, #, ? dll),
    // lalu gabung dengan "/" literal — bukan encodeURIComponent seluruh string
    // karena itu akan encode "/" jadi %2F.
    const encodedPath = path
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    return apiRequest<FolderByPathResponse>(`/folders/resolve?folder=${encodedPath}`);
  },

  /**
   * Get ancestor chain for a folder ID.
   */
  ancestors: (id: number) =>
    apiRequest<{ folder: Folder; ancestors: Folder[] }>(`/folders/${id}/ancestors`),

  create: (input: { name: string; parentFolderId?: number | null }) =>
    apiRequest<{ folder: Folder }>("/folders", { method: "POST", body: input }),

  rename: (id: number, name: string) =>
    apiRequest<{ message: string }>(`/folders/${id}`, { method: "PATCH", body: { name } }),

  remove: (id: number) => apiRequest<{ message: string }>(`/folders/${id}`, { method: "DELETE" }),

  share: (id: number) =>
    apiRequest<{ shareUuid: string; pageUrl: string }>(`/folders/${id}/share`, { method: "POST" }),

  unshare: (id: number) =>
    apiRequest<{ message: string }>(`/folders/${id}/share`, { method: "DELETE" }),
};
