import type { Context } from "hono";
import type { Env } from "../config/env";
import { AuditLogRepository } from "../database/audit-log.repository";
import { extractRealIp } from "./ip-parser";
import { resolveGeo } from "./geo-resolver";

export function writeAuditLog(
  c: Context<{ Bindings: Env }>,
  params: {
    action: string;
    status: "success" | "warning" | "error" | "info";
    user?: string;
    detail?: string;
  }
): void {
  const repo = new AuditLogRepository(c.env.DB);
  const ip = extractRealIp(c);
  const userAgent = c.req.header("User-Agent") ?? "";
  const cfCountry = (c.req.raw.cf?.country as string) || "";
  const cfTimezone = (c.req.raw.cf as any)?.timezone as string || "";

  c.executionCtx.waitUntil(
    resolveGeo(ip, cfCountry || null, cfTimezone || null).then((geo) =>
      repo.create({
        action: params.action,
        status: params.status,
        user: params.user ?? "admin",
        ip,
        country: geo.country ?? "",
        timezone: geo.timezone ?? "",
        userAgent,
        detail: params.detail,
      })
    )
  );
}
