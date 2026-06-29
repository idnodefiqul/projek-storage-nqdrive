import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authService } from "../services/auth.service";

export const authQueryKeys = {
  setupStatus: ["auth", "setup-status"] as const,
  me: ["auth", "me"] as const,
};

export function useSetupStatus() {
  return useQuery({
    queryKey: authQueryKeys.setupStatus,
    queryFn: authService.getSetupStatus,
  });
}

export function useMe(enabled = true) {
  return useQuery({
    queryKey: authQueryKeys.me,
    queryFn: authService.me,
    enabled,
    retry: false,
  });
}

export function useSetupAdmin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authService.setupAdmin,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authQueryKeys.setupStatus });
    },
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authService.login,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authQueryKeys.me });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authService.logout,
    onSuccess: () => {
      queryClient.setQueryData(authQueryKeys.me, undefined);
      queryClient.invalidateQueries({ queryKey: authQueryKeys.me });
    },
  });
}

export function useChangePassword() {
  return useMutation({ mutationFn: authService.changePassword });
}
