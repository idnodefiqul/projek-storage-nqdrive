import { apiRequest } from "../lib/api-client";
import type { Folder } from "@nqdrive/types";

export const folderService = {
  list: (parentFolderId: number | null = null) =>
    apiRequest<{ folders: Folder[] }>(
      parentFolderId ? `/folders?parentFolderId=${parentFolderId}` : "/folders"
    ),

  create: (input: { name: string; parentFolderId?: number | null }) =>
    apiRequest<{ folder: Folder }>("/folders", { method: "POST", body: input }),

  rename: (id: number, name: string) =>
    apiRequest<{ message: string }>(`/folders/${id}`, { method: "PATCH", body: { name } }),

  remove: (id: number) => apiRequest<{ message: string }>(`/folders/${id}`, { method: "DELETE" }),
};
