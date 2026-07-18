import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { logService } from "../services/log.service";
import { apiKeyService } from "../services/api-key.service";

export function useUploadLogs() {
  return useQuery({
    queryKey: ["logs", "uploads"],
    queryFn: logService.listUploads,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
}

export function useDownloadLogs() {
  return useQuery({
    queryKey: ["logs", "downloads"],
    queryFn: logService.listDownloads,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
}

export function useApiKeys() {
  return useQuery({ queryKey: ["api-keys", "list"], queryFn: apiKeyService.list });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiKeyService.create(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiKeyService.revoke(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  });
}
