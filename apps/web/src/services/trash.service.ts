import { apiRequest } from "../lib/client";
import type { TrashResponse } from "@nqdrive/types";

export const trashService = {
  /** GET /api/trash — list semua item di Trash */
  list: () => apiRequest<TrashResponse>("/trash"),

  /** GET /api/trash/count — jumlah item di Trash (untuk badge) */
  count: () => apiRequest<{ count: number }>("/trash/count"),

  restoreFile: (id: string) =>
    apiRequest<{ message: string }>(`/trash/restore/file/${id}`, { method: "POST" }),

  restoreFolder: (id: string) =>
    apiRequest<{ message: string }>(`/trash/restore/folder/${id}`, { method: "POST" }),

  permanentDeleteFile: (id: string) =>
    apiRequest<{ message: string }>(`/trash/file/${id}`, { method: "DELETE" }),

  permanentDeleteFolder: (id: string) =>
    apiRequest<{ message: string }>(`/trash/folder/${id}`, { method: "DELETE" }),

  /** DELETE /api/trash/empty — kosongkan seluruh Trash */
  empty: () =>
    apiRequest<{ message: string; deletedFiles: number; deletedFolders: number }>("/trash/empty", {
      method: "DELETE",
    }),
};
