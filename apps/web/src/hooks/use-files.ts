import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fileService, type ListFilesParams } from "../services/file.service";
import type { FileVisibility } from "@nqdrive/types";

export const fileQueryKeys = {
  list: (params: ListFilesParams) => ["files", "list", params] as const,
};

export function useFiles(params: ListFilesParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: fileQueryKeys.list(params),
    queryFn: ({ signal }) => fileService.list(params, signal),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    // Placeholder HANYA dipertahankan jika masih di folder yang sama (pagination/search mulus).
    // Saat GANTI folder, placeholder dibuang → isLoading true → skeleton muncul,
    // sehingga file folder lama tidak "nyangkut" tampil beberapa detik.
    placeholderData: (prev, prevQuery) => {
      const prevParams = prevQuery?.queryKey?.[2] as ListFilesParams | undefined;
      if ((prevParams?.folderId ?? null) !== (params.folderId ?? null)) return undefined;
      return prev;
    },
    enabled: options?.enabled ?? true,
  });
}

export function useRenameFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, filename }: { id: string; filename: string }) => fileService.rename(id, filename),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["files"] }),
  });
}

export function useUpdateFileVisibility() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, visibility }: { id: string; visibility: FileVisibility }) =>
      fileService.updateVisibility(id, visibility),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["files"] }),
  });
}

export function useDeleteFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fileService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["storage-manager"] });
      queryClient.invalidateQueries({ queryKey: ["trash"] });
    },
  });
}

export function useMoveFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, targetFolderId }: { id: string; targetFolderId: string | null }) =>
      fileService.move(id, targetFolderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["folders"] }); // size folder asal & tujuan berubah
    },
  });
}

export function useCopyFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, targetFolderId }: { id: string; targetFolderId: string | null }) =>
      fileService.copy(id, targetFolderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      queryClient.invalidateQueries({ queryKey: ["storage-manager"] }); // kuota akun bertambah
    },
  });
}

export function useRenameSyncFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, filename }: { slug: string; filename: string }) => fileService.renameSync(slug, filename),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["files"] }),
  });
}

export function useFileContent(slug: string | null) {
  return useQuery({
    queryKey: ["file-content", slug],
    queryFn: () => fileService.getContent(slug!),
    enabled: slug !== null,
  });
}

export function useUpdateFileContent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, content }: { slug: string; content: string }) => fileService.updateContent(slug, content),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["file-content", variables.slug] });
      queryClient.invalidateQueries({ queryKey: ["files"] });
    },
  });
}

export function usePreviewToken(slug: string | null) {
  return useQuery({
    queryKey: ["preview-token", slug],
    queryFn: () => fileService.getPreview(slug!),
    enabled: slug !== null,
    staleTime: 240_000,
  });
}
