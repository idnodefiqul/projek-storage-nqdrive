import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authService } from "../services/auth.service";

export const authQueryKeys = {
  setupStatus: ["auth", "setup-status"] as const,
  me: ["auth", "me"] as const,
};

export function useSetupStatus() {
  const isSetupCompleted = localStorage.getItem("nqdrive_setup_completed") === "true";
  
  return useQuery({
    queryKey: authQueryKeys.setupStatus,
    queryFn: async () => {
      const res = await authService.getSetupStatus();
      if (res.setupCompleted) {
        localStorage.setItem("nqdrive_setup_completed", "true");
      }
      return res;
    },
    initialData: isSetupCompleted ? { setupCompleted: true } : undefined,
    staleTime: isSetupCompleted ? Infinity : 0,
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
      localStorage.setItem("nqdrive_setup_completed", "true");
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
