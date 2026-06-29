/**
 * Generates a new API key in two parts:
 *   - the full key (shown to the admin exactly once, never stored)
 *   - a short prefix (stored in plaintext for UI identification, e.g. "nqd_live_a1b2")
 *   - a SHA-256 hash of the full key (what's actually stored and compared on each request)
 */
export async function generateApiKey(): Promise<{ fullKey: string; prefix: string; hash: string }> {
  const randomBytes = crypto.getRandomValues(new Uint8Array(24));
  const randomPart = bytesToHex(randomBytes);
  const fullKey = `nqd_live_${randomPart}`;
  const prefix = fullKey.slice(0, 16);

  const hash = await sha256Hex(fullKey);

  return { fullKey, prefix, hash };
}

export async function hashApiKey(key: string): Promise<string> {
  return sha256Hex(key);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}
