/**
 * Resolves country and timezone for an IP using ip-api.com + Cloudflare cf.
 * Uses edge cache to avoid repeated calls (TTL 24h).
 * Falls back to Cloudflare's cf.country / cf.timezone.
 */

export interface GeoInfo {
  country: string | null;
  timezone: string | null;
}

export async function resolveGeo(
  ip: string,
  cfCountry: string | null,
  cfTimezone: string | null
): Promise<GeoInfo> {
  // Skip lookup for private / loopback / unknown IPs
  if (!ip || ip === "unknown" || ip === "127.0.0.1" || ip === "::1") {
    return { country: cfCountry, timezone: cfTimezone };
  }

  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=countryCode,timezone,status`,
      {
        // @ts-ignore — Cloudflare-specific fetch option
        cf: { cacheEverything: true, cacheTtl: 86400 },
      }
    );

    if (!res.ok) return { country: cfCountry, timezone: cfTimezone };

    const data = (await res.json()) as { status?: string; countryCode?: string; timezone?: string };
    if (data.status === "success") {
      return {
        country: data.countryCode || cfCountry,
        timezone: data.timezone || cfTimezone,
      };
    }
  } catch {
    // fallback
  }

  return { country: cfCountry, timezone: cfTimezone };
}

// Backward compat wrapper
export async function resolveCountry(
  ip: string,
  cfCountry: string | null
): Promise<string | null> {
  const geo = await resolveGeo(ip, cfCountry, null);
  return geo.country;
}
