import { apiRequest } from "../lib/client";
import type { TrashResponse } from "@nqdrive/types";

export const trashService = {
  /** GET /api/trash — list semua item di Trash */
  list: () => apiRequest<TrashResponse>("/trash"),

  /** GET /api/trash/count — jumlah item di Trash (untuk badge) */
  count: () => apiRequest<{ count: number }>("/trash/count"),

  /** POST /api/trash/restore/file/:id */
  restoreFile: (id: number) =>
    apiRequest<{ message: string }>(`/trash/restore/file/${id}`, { method: "POST" }),

  /** POST /api/trash/restore/folder/:id */
  restoreFolder: (id: number) =>
    apiRequest<{ message: string }>(`/trash/restore/folder/${id}`, { method: "POST" }),

  /** DELETE /api/trash/file/:id — hapus permanen satu file */
  permanentDeleteFile: (id: number) =>
    apiRequest<{ message: string }>(`/trash/file/${id}`, { method: "DELETE" }),

  /** DELETE /api/trash/folder/:id — hapus permanen satu folder */
  permanentDeleteFolder: (id: number) =>
    apiRequest<{ message: string }>(`/trash/folder/${id}`, { method: "DELETE" }),

  /** DELETE /api/trash/empty — kosongkan seluruh Trash */
  empty: () =>
    apiRequest<{ message: string; deletedFiles: number; deletedFolders: number }>("/trash/empty", {
      method: "DELETE",
    }),
};
