import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { folderService } from "../services/folder.service";

/**
 * Flat list semua folder — dipakai picker Pindah/Salin agar 1 request = semua folder.
 * Cache 2 menit, tidak refetch saat window focus.
 */
export function useAllFolders(enabled = true) {
  return useQuery({
    queryKey: ["folders", "all"],
    queryFn: ({ signal }) => folderService.all(signal),
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    enabled,
  });
}

/**
 * Resolves a human-readable path ("Dokumen/Proyek") to folder data.
 * Pass empty string for root.
 */
export function useFolderByPath(path: string) {
  return useQuery({
    queryKey: ["folders", "resolve", path],
    queryFn: ({ signal }) => folderService.byPath(path, signal),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 2,
    // JANGAN pertahankan placeholder saat path berubah — kalau tidak, children/folderId
    // milik folder LAMA dipakai dulu beberapa detik sebelum data folder baru datang.
    placeholderData: (prev, prevQuery) => {
      const prevPath = prevQuery?.queryKey?.[2] as string | undefined;
      if (prevPath !== path) return undefined;
      return prev;
    },
  });
}

/**
 * Legacy hook — lists folders by parentFolderId (integer).
 * Kept for backward-compat but prefer useFolderByPath in new code.
 */
export function useFolders(parentFolderId: string | null = null) {
  return useQuery({
    queryKey: ["folders", "list", parentFolderId],
    queryFn: ({ signal }) => folderService.list(parentFolderId, signal),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export function useCreateFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: folderService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
    },
  });
}

export function useDeleteFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => folderService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["trash"] });
    },
  });
}

export function useRenameFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => folderService.rename(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
    },
  });
}
export function useShareFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => folderService.share(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["folders"] }),
  });
}

export function useUnshareFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => folderService.unshare(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["folders"] }),
  });
}
