import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { driveAccountService, googleDriveService } from "../services/drive-account.service";
import { storageManagerService } from "../services/storage-manager.service";

export function useDriveAccounts() {
  return useQuery({
    queryKey: ["drive-accounts", "list"],
    queryFn: driveAccountService.list,
  });
}

export function useDeleteDriveAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => driveAccountService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drive-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["storage-manager"] });
    },
  });
}

export function useConnectGoogleAccountViaToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (refreshToken: string) => googleDriveService.connectViaRefreshToken(refreshToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drive-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["storage-manager"] });
    },
  });
}

export function useValidateRefreshToken() {
  return useMutation({
    mutationFn: (refreshToken: string) => googleDriveService.validateRefreshToken(refreshToken),
  });
}

export function useStorageManagerSummary() {
  return useQuery({
    queryKey: ["storage-manager", "summary"],
    queryFn: storageManagerService.getSummary,
    refetchInterval: 30_000,
  });
}
