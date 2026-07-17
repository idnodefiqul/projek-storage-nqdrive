import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { folderService } from "../services/folder.service";

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
    placeholderData: (prev) => prev,
  });
}

/**
 * Legacy hook — lists folders by parentFolderId (integer).
 * Kept for backward-compat but prefer useFolderByPath in new code.
 */
export function useFolders(parentFolderId: number | null = null) {
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
    mutationFn: (id: number) => folderService.remove(id),
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
    mutationFn: ({ id, name }: { id: number; name: string }) => folderService.rename(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
    },
  });
}
export function useShareFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => folderService.share(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["folders"] }),
  });
}

export function useUnshareFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => folderService.unshare(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["folders"] }),
  });
}
