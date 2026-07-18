import { Hono } from "hono";
import { requireAuth } from "../middleware/require-auth.middleware";
import type { Env } from "../config/env";

const logRoutes = new Hono<{ Bindings: Env }>();

logRoutes.use("*", requireAuth);

interface UploadLogRow {
  public_id: string | null;
  filename: string;
  size_bytes: number;
  status: string;
  duration_ms: number;
  error_message: string | null;
  created_at: string;
}

interface DownloadLogRow {
  public_id: string | null;
  file_public_id: string | null;
  filename: string | null;
  ip_address: string;
  country: string | null;
  bytes_served: number;
  status: string;
  created_at: string;
}

/** GET /api/logs/uploads — most recent upload attempts, professional IDs only */
logRoutes.get("/uploads", async (c) => {
  const limit = Math.min(100, Number(c.req.query("limit") ?? 50));
  const { results } = await c.env.DB.prepare(
    "SELECT public_id, filename, size_bytes, status, duration_ms, error_message, created_at FROM upload_logs ORDER BY created_at DESC LIMIT ?"
  )
    .bind(limit)
    .all<UploadLogRow>();

  const logs = results.map((r: any) => ({
    logId: r.public_id,
    filename: r.filename,
    size_bytes: r.size_bytes,
    status: r.status,
    duration_ms: r.duration_ms,
    error_message: r.error_message,
    created_at: r.created_at,
  }));

  return c.json({ success: true, data: { logs } });
});

/** GET /api/logs/downloads — professional IDs only: logId + fileId */
logRoutes.get("/downloads", async (c) => {
  const limit = Math.min(100, Number(c.req.query("limit") ?? 50));
  const { results } = await c.env.DB.prepare(
    `SELECT dl.public_id, f.public_id as file_public_id, f.filename, dl.ip_address, dl.country, dl.bytes_served, dl.status, dl.created_at
     FROM download_logs dl
     LEFT JOIN files f ON f.id = dl.file_id
     ORDER BY dl.created_at DESC LIMIT ?`
  )
    .bind(limit)
    .all<DownloadLogRow>();

  const logs = results.map((r: any) => ({
    logId: r.public_id,
    fileId: r.file_public_id,
    filename: r.filename,
    ip_address: r.ip_address,
    country: r.country,
    bytes_served: r.bytes_served,
    status: r.status,
    created_at: r.created_at,
  }));

  return c.json({ success: true, data: { logs } });
});

export { logRoutes };
