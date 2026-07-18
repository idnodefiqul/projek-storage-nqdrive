import { apiRequest } from "../lib/client";
import type { FileVisibility, FileWithAccount, PaginatedData } from "@nqdrive/types";

export interface ListFilesParams {
  page?: number;
  pageSize?: number;
  search?: string;
  folderId?: string | null;
  visibility?: FileVisibility;
}

function buildQueryString(params: ListFilesParams): string {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set("page", String(params.page));
  if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
  if (params.search) searchParams.set("search", params.search);
  if (params.folderId !== undefined) {
    if (params.folderId === null) searchParams.set("folderId", "");
    else searchParams.set("folderId", params.folderId);
  }
  if (params.visibility) searchParams.set("visibility", params.visibility);
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export const fileService = {
  list: (params: ListFilesParams = {}, signal?: AbortSignal) =>
    apiRequest<PaginatedData<FileWithAccount>>(`/files${buildQueryString(params)}`, {
      signal,
    }),

  rename: (id: string, filename: string) =>
    apiRequest<{ message: string }>(`/files/${id}/rename`, { method: "PATCH", body: { filename } }),

  updateVisibility: (id: string, visibility: FileVisibility) =>
    apiRequest<{ message: string }>(`/files/${id}/visibility`, { method: "PATCH", body: { visibility } }),

  renameSync: (slug: string, filename: string) =>
    apiRequest<{ message: string }>(`/files/rename-sync?file=${encodeURIComponent(slug)}`, { method: "PATCH", body: { filename } }),

  getContent: (slug: string) =>
    apiRequest<{ content: string }>(`/files/content?file=${encodeURIComponent(slug)}`),

  updateContent: (slug: string, content: string) =>
    apiRequest<{ message: string }>(`/files/content?file=${encodeURIComponent(slug)}`, { method: "PUT", body: { content } }),

  getPreview: (slug: string) =>
    apiRequest<{ token: string }>(`/files/preview?file=${encodeURIComponent(slug)}`),

  remove: (id: string) => apiRequest<{ message: string }>(`/files/${id}`, { method: "DELETE" }),
};
