import { createAvatar } from "@dicebear/core";
import { pixelArt } from "@dicebear/collection";

/**
 * Generate a pixel art avatar Data URI based on a seed (e.g. username or user ID)
 */
export function getAvatarSvg(seed: string): string {
  return createAvatar(pixelArt, {
    seed,
  }).toDataUri();
}
