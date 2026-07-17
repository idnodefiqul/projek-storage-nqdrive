import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSettings, updateSettings } from "../services/settings.service";
import type { SiteSettings } from "../services/settings.service";
import { setCachedAvatarConfig, type AvatarStyle } from "../lib/avatar";
import { applyBrandFromDb } from "../stores/theme-provider";

export const settingsQueryKeys = {
  all: () => ["settings"] as const,
};

/** Fetch site settings (authenticated). Syncs avatar config on load.
 *  Optimized: staleTime 5 menit + no background refetch agar tidak ganggu scroll perf
 */
export function useSettings() {
  return useQuery({
    queryKey: settingsQueryKeys.all(),
    queryFn: async () => {
      const data = await getSettings();
      if (data.avatar_seed) {
        setCachedAvatarConfig({
          style: (data.avatar_style || "pixelArt") as AvatarStyle,
          seed: data.avatar_seed,
        });
        window.dispatchEvent(new Event("avatar-changed"));
      }
      applyBrandFromDb(data.brand_color, data.theme_mode);
      return data;
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchInterval: false, // jangan polling — hanya refetch saat window focus atau manual
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
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
