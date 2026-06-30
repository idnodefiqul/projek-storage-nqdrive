/**
 * Resolves the country code for an IP address using ip-api.com.
 * Uses Cloudflare's edge fetch cache to avoid repeated external calls
 * for the same IP (TTL 24 hours) and stay within free tier rate limits.
 *
 * Falls back to Cloudflare's built-in cf.country if the external call fails.
 */
export async function resolveCountry(
  ip: string,
  cfCountry: string | null
): Promise<string | null> {
  // Skip lookup for private / loopback / unknown IPs
  if (!ip || ip === "unknown" || ip === "127.0.0.1" || ip === "::1") {
    return cfCountry;
  }

  try {
    // ip-api.com is free (45 req/min) — Cloudflare edge cache prevents repeated calls for same IP.
    // Using HTTP (not HTTPS) because ip-api.com free tier only supports HTTP.
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=countryCode,status`,
      {
        // @ts-ignore — Cloudflare-specific fetch option for edge caching
        cf: { cacheEverything: true, cacheTtl: 86400 }, // cache 24h at CF edge
      }
    );

    if (!res.ok) return cfCountry;

    const data = (await res.json()) as { status?: string; countryCode?: string };
    if (data.status === "success" && data.countryCode) {
      return data.countryCode;
    }
  } catch {
    // Silently fall back to cf.country on any error
  }

  return cfCountry;
}
