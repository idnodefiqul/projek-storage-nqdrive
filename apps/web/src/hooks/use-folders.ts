import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { folderService } from "../services/folder.service";

export function useFolders(parentFolderId: number | null = null) {
  return useQuery({
    queryKey: ["folders", "list", parentFolderId],
    queryFn: () => folderService.list(parentFolderId),
  });
}

export function useCreateFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: folderService.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["folders"] }),
  });
}

export function useDeleteFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => folderService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      queryClient.invalidateQueries({ queryKey: ["files"] }); // files inside may now be at root
    },
  });
}
