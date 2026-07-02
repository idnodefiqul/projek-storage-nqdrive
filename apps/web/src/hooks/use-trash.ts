import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trashService } from "../services/trash.service";

export const trashQueryKeys = {
  list: () => ["trash", "list"] as const,
  count: () => ["trash", "count"] as const,
};

/** Hook untuk mengambil semua item di Trash */
export function useTrashItems() {
  return useQuery({
    queryKey: trashQueryKeys.list(),
    queryFn: () => trashService.list(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** Hook untuk jumlah item di Trash (badge sidebar) */
export function useTrashCount() {
  return useQuery({
    queryKey: trashQueryKeys.count(),
    queryFn: () => trashService.count(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** Hook untuk restore file dari Trash */
export function useRestoreFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => trashService.restoreFile(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
    },
  });
}

/** Hook untuk restore folder dari Trash */
export function useRestoreFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => trashService.restoreFolder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
    },
  });
}

/** Hook untuk hapus permanen file dari Trash */
export function usePermanentDeleteFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => trashService.permanentDeleteFile(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["storage-manager"] });
    },
  });
}

/** Hook untuk hapus permanen folder dari Trash */
export function usePermanentDeleteFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => trashService.permanentDeleteFolder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["storage-manager"] });
    },
  });
}

/** Hook untuk kosongkan seluruh Trash */
export function useEmptyTrash() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => trashService.empty(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["storage-manager"] });
    },
  });
}
