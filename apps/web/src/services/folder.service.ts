import { apiRequest } from "../lib/api-client";
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
   * Resolve a slash-separated human-readable path to folder data + children.
   * e.g. byPath("Dokumen/Proyek/2025") → { folder, folderId, ancestors, children }
   * byPath("") → root
   */
  byPath: (path: string) =>
    apiRequest<FolderByPathResponse>(
      path ? `/folders/by-path?path=${encodeURIComponent(path)}` : "/folders/by-path"
    ),

  /**
   * Get ancestor chain for a folder ID — used after creating a subfolder to rebuild path.
   */
  ancestors: (id: number) =>
    apiRequest<{ folder: Folder; ancestors: Folder[] }>(`/folders/${id}/ancestors`),

  create: (input: { name: string; parentFolderId?: number | null }) =>
    apiRequest<{ folder: Folder }>("/folders", { method: "POST", body: input }),

  rename: (id: number, name: string) =>
    apiRequest<{ message: string }>(`/folders/${id}`, { method: "PATCH", body: { name } }),

  remove: (id: number) => apiRequest<{ message: string }>(`/folders/${id}`, { method: "DELETE" }),
};
