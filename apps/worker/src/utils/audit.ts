import type { Context } from "hono";
import type { Env } from "../config/env";
import { AuditLogRepository } from "../database/audit-log.repository";
import { extractRealIp } from "./ip-parser";
import { resolveCountry } from "./geo-resolver";

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

  c.executionCtx.waitUntil(
    resolveCountry(ip, cfCountry || null).then((country) =>
      repo.create({
        action: params.action,
        status: params.status,
        user: params.user ?? "admin",
        ip,
        country: country ?? "",
        userAgent,
        detail: params.detail,
      })
    )
  );
}
