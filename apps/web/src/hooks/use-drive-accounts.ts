import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { driveAccountService, googleDriveService, dropboxService, oneDriveService } from "../services/drive-account.service";
import { storageManagerService } from "../services/storage-manager.service";

export function useDriveAccounts() {
  return useQuery({
    queryKey: ["drive-accounts", "list"],
    queryFn: ({ signal }) => driveAccountService.list(signal),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 2,
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

export function useGoogleOAuthUrl() {
  return useMutation({
    mutationFn: () => googleDriveService.getOAuthUrl(),
  });
}

export function useDropboxOAuthUrl() {
  return useMutation({
    mutationFn: () => dropboxService.getOAuthUrl(),
  });
}

export function useOneDriveOAuthUrl() {
  return useMutation({
    mutationFn: () => oneDriveService.getOAuthUrl(),
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
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
}

export function useSyncAllAccounts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => storageManagerService.syncAll(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storage-manager"] });
      queryClient.invalidateQueries({ queryKey: ["drive-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useFormatDriveAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => driveAccountService.format(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drive-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["storage-manager"] });
      queryClient.invalidateQueries({ queryKey: ["files"] });
    },
  });
}

export function useFormatAllDriveAccounts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => driveAccountService.formatAll(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drive-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["storage-manager"] });
      queryClient.invalidateQueries({ queryKey: ["files"] });
    },
  });
}
