import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { folderService } from "../services/folder.service";

/**
 * Resolves a human-readable path ("Dokumen/Proyek") to folder data.
 * Pass empty string for root.
 */
export function useFolderByPath(path: string) {
  return useQuery({
    queryKey: ["folders", "resolve", path],
    queryFn: () => folderService.byPath(path),
    staleTime: 30_000,
  });
}

/**
 * Legacy hook — lists folders by parentFolderId (integer).
 * Kept for backward-compat but prefer useFolderByPath in new code.
 */
export function useFolders(parentFolderId: number | null = null) {
  return useQuery({
    queryKey: ["folders", "list", parentFolderId],
    queryFn: () => folderService.list(parentFolderId),
    staleTime: 30_000,
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
    },
  });
}
