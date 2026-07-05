import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authService } from "../services/auth.service";

export const authQueryKeys = {
  setupStatus: ["auth", "setup-status"] as const,
  me: ["auth", "me"] as const,
};

export function useSetupStatus() {
  return useQuery({
    queryKey: authQueryKeys.setupStatus,
    queryFn: async () => {
      return await authService.getSetupStatus();
    },
    // Jika sudah setup, cache di memory Infinity agar tidak spam backend, 
    // tapi TIDAK simpan di localStorage.
    staleTime: 60_000, 
  });
}

export function useMe(enabled = true) {
  return useQuery({
    queryKey: authQueryKeys.me,
    queryFn: authService.me,
    enabled: enabled && localStorage.getItem("nqdrive_is_logged_in") !== "false",
    retry: false,
    refetchOnWindowFocus: false,
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
    onSuccess: (data) => {
      // Don't set logged in if 2FA is required (session cookie not yet issued)
      if (data.twoFactorRequired) return;
      localStorage.setItem("nqdrive_is_logged_in", "true");
      queryClient.invalidateQueries({ queryKey: authQueryKeys.me });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authService.logout,
    onSuccess: () => {
      localStorage.setItem("nqdrive_is_logged_in", "false");
      queryClient.clear();
    },
  });
}

export function useChangePassword() {
  return useMutation({ mutationFn: authService.changePassword });
}
