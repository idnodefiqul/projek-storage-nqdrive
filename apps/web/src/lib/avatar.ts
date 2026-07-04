import { createAvatar } from "@dicebear/core";
import { pixelArt, avataaars } from "@dicebear/collection";

export type AvatarStyle = "pixelArt" | "avataaars";

const STYLES = { pixelArt, avataaars } as const;

export interface AvatarConfig {
  style: AvatarStyle;
  seed: string;
}

let cachedConfig: AvatarConfig | null = null;

export function setCachedAvatarConfig(config: AvatarConfig | null): void {
  cachedConfig = config;
}

export function getCachedAvatarConfig(): AvatarConfig | null {
  return cachedConfig;
}

export function generateAvatar(style: AvatarStyle, seed: string): string {
  return createAvatar(STYLES[style] as any, { seed }).toDataUri();
}

export function getAvatarSvg(fallbackSeed: string): string {
  if (cachedConfig && cachedConfig.seed) {
    return generateAvatar(cachedConfig.style, cachedConfig.seed);
  }
  return generateAvatar("pixelArt", fallbackSeed);
}

export function generateSeeds(count: number): string[] {
  const seeds: string[] = [];
  for (let i = 0; i < count; i++) {
    seeds.push(`avatar-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`);
  }
  return seeds;
}

export const AVATAR_STYLES: { value: AvatarStyle; label: string }[] = [
  { value: "pixelArt", label: "Pixel Art" },
  { value: "avataaars", label: "Avataaars" },
];
