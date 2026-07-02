import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSettings, updateSettings } from "../services/settings.service";
import type { SiteSettings } from "../services/settings.service";

export const settingsQueryKeys = {
  all: () => ["settings"] as const,
};

/** Fetch site settings (authenticated). */
export function useSettings() {
  return useQuery({
    queryKey: settingsQueryKeys.all(),
    queryFn: getSettings,
    staleTime: 30_000,
  });
}

/**
 * Mutation to update settings.
 * After success: immediately refetch cache.
 */
export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: Partial<SiteSettings>) => updateSettings(updates),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: settingsQueryKeys.all() });
    },
  });
}
