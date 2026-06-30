import { Hono } from "hono";
import { requireAuth } from "../middleware/require-auth.middleware";
import type { Env } from "../config/env";

const logRoutes = new Hono<{ Bindings: Env }>();

logRoutes.use("*", requireAuth);

interface UploadLogRow {
  id: number;
  filename: string;
  size_bytes: number;
  status: string;
  duration_ms: number;
  error_message: string | null;
  created_at: string;
}

interface DownloadLogRow {
  id: number;
  file_id: number | null;
  filename: string | null;
  ip_address: string;
  country: string | null;
  bytes_served: number;
  status: string;
  created_at: string;
}

/** GET /api/logs/uploads — most recent upload attempts, success or failure. */
logRoutes.get("/uploads", async (c) => {
  const limit = Math.min(100, Number(c.req.query("limit") ?? 50));
  const { results } = await c.env.DB.prepare(
    "SELECT id, filename, size_bytes, status, duration_ms, error_message, created_at FROM upload_logs ORDER BY created_at DESC LIMIT ?"
  )
    .bind(limit)
    .all<UploadLogRow>();

  return c.json({ success: true, data: { logs: results } });
});

/** GET /api/logs/downloads — most recent download requests, joined with the file's name. */
logRoutes.get("/downloads", async (c) => {
  const limit = Math.min(100, Number(c.req.query("limit") ?? 50));
  const { results } = await c.env.DB.prepare(
    `SELECT dl.id, dl.file_id, f.filename, dl.ip_address, dl.country, dl.bytes_served, dl.status, dl.created_at
     FROM download_logs dl
     LEFT JOIN files f ON f.id = dl.file_id
     ORDER BY dl.created_at DESC LIMIT ?`
  )
    .bind(limit)
    .all<DownloadLogRow>();

  return c.json({ success: true, data: { logs: results } });
});

export { logRoutes };
