import type { Context } from "hono";

export function extractRealIp(c: Context): string {
  const rawHeaders = [
    c.req.header("CF-Connecting-IP"),
    c.req.header("X-Forwarded-For"),
    c.req.header("X-Real-IP"),
  ];

  // Try to find the first valid IPv4 address (contains a dot)
  for (const header of rawHeaders) {
    if (!header) continue;
    const ips = header.split(",").map((ip: string) => ip.trim());
    for (const ip of ips) {
      if (ip.includes(".")) return ip;
    }
  }

  // Fallback to the first available IP (which might be IPv6)
  for (const header of rawHeaders) {
    if (!header) continue;
    const ips = header.split(",").map((ip: string) => ip.trim());
    if (ips.length > 0 && ips[0]) return ips[0];
  }

  return "unknown";
}
