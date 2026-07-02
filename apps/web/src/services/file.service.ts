import { apiRequest } from "../lib/client";
import type { FileVisibility, FileWithAccount, PaginatedData } from "@nqdrive/types";

export interface ListFilesParams {
  page?: number;
  pageSize?: number;
  search?: string;
  folderId?: number;
  visibility?: FileVisibility;
}

function buildQueryString(params: ListFilesParams): string {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set("page", String(params.page));
  if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
  if (params.search) searchParams.set("search", params.search);
  if (params.folderId !== undefined) searchParams.set("folderId", String(params.folderId));
  if (params.visibility) searchParams.set("visibility", params.visibility);
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export const fileService = {
  list: (params: ListFilesParams = {}) =>
    apiRequest<PaginatedData<FileWithAccount>>(`/files${buildQueryString(params)}`),

  rename: (id: number, filename: string) =>
    apiRequest<{ message: string }>(`/files/${id}/rename`, { method: "PATCH", body: { filename } }),

  updateVisibility: (id: number, visibility: FileVisibility) =>
    apiRequest<{ message: string }>(`/files/${id}/visibility`, { method: "PATCH", body: { visibility } }),

  remove: (id: number) => apiRequest<{ message: string }>(`/files/${id}`, { method: "DELETE" }),
};
