import type { Context } from "hono";

/**
 * Extract the real client IP address, strongly preferring IPv4.
 *
 * When a browser connects to Cloudflare over IPv6, all headers contain
 * the visitor's IPv6 address and there is no IPv4 available in any header.
 * To force IPv4 detection for all visitors, disable IPv6 in Cloudflare:
 *   Dashboard > domain > DNS > Settings > toggle off "IPv6 Compatibility"
 *
 * Lookup order:
 * 1. Cf-Pseudo-IPv4 (if Cloudflare Pseudo IPv4 is enabled)
 * 2. First IPv4 found across CF-Connecting-IP, X-Forwarded-For, X-Real-IP
 * 3. Fallback: first IP from any header (may be IPv6 if no IPv4 exists)
 */
export function extractRealIp(c: Context): string {
  const pseudoV4 = c.req.header("Cf-Pseudo-IPv4");
  if (pseudoV4 && pseudoV4.includes(".")) return pseudoV4.trim();

  const headers = [
    c.req.header("CF-Connecting-IP"),
    c.req.header("X-Forwarded-For"),
    c.req.header("X-Real-IP"),
  ];

  const allIps: string[] = [];
  for (const header of headers) {
    if (!header) continue;
    for (const part of header.split(",")) {
      const ip = part.trim();
      if (ip) allIps.push(ip);
    }
  }

  const ipv4 = allIps.find((ip) => ip.includes(".") && !ip.includes(":"));
  if (ipv4) return ipv4;

  if (allIps.length > 0) return allIps[0]!;

  return "unknown";
}
