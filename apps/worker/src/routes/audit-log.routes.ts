import { Hono } from "hono";
import { requireAuth } from "../middleware/require-auth.middleware";
import { AuditLogRepository } from "../database/audit-log.repository";
import type { Env } from "../config/env";

const auditLogRoutes = new Hono<{ Bindings: Env }>();

auditLogRoutes.use("*", requireAuth);

auditLogRoutes.get("/", async (c) => {
  const repo = new AuditLogRepository(c.env.DB);
  const result = await repo.query({
    limit: Number(c.req.query("limit") ?? 50),
    offset: Number(c.req.query("offset") ?? 0),
    status: c.req.query("status") || undefined,
    action: c.req.query("action") || undefined,
    user: c.req.query("user") || undefined,
    dateFrom: c.req.query("dateFrom") || undefined,
    dateTo: c.req.query("dateTo") || undefined,
    search: c.req.query("search") || undefined,
  });
  return c.json({ success: true, data: result });
});

auditLogRoutes.get("/stats", async (c) => {
  const repo = new AuditLogRepository(c.env.DB);
  const stats = await repo.stats();
  return c.json({ success: true, data: stats });
});

auditLogRoutes.get("/filters", async (c) => {
  const repo = new AuditLogRepository(c.env.DB);
  const [actions, users] = await Promise.all([repo.distinctActions(), repo.distinctUsers()]);
  return c.json({ success: true, data: { actions, users } });
});

export { auditLogRoutes };
