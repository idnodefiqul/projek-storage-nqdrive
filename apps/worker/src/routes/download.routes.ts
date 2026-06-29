import { Hono, type Context } from "hono";
import { parseRangeHeader } from "../utils/range-parser";
import { DownloadService, FileNotAccessibleError } from "../services/download.service";
import { DownloadLogRepository } from "../database/download-log.repository";
import type { Env } from "../config/env";

/**
 * Public download routes — mounted WITHOUT the /api prefix.
 * Supports Range requests (206 Partial Content) for resume-capable downloads.
 * Private/hidden files return generic 404 — no 403 leakage.
 */
const downloadRoutes = new Hono<{ Bindings: Env }>();

// ─── SECURITY FIX #7: Content-Disposition header injection via filename ────
// Sebelumnya: `attachment; filename="${file.filename}"` tanpa sanitasi.
// Jika filename mengandung karakter seperti `"` atau newline, attacker bisa
// inject header tambahan. Fix: encode filename dengan RFC 5987 (filename*=UTF-8).
function safeContentDisposition(filename: string): string {
  // Hapus karakter kontrol (termasuk \r, \n) yang bisa inject header baru
  const sanitized = filename.replace(/[\x00-\x1f\x7f]/g, "").replace(/"/g, "'");
  // Encode filename dengan RFC 5987 untuk support non-ASCII
  const encoded = encodeURIComponent(filename);
  // Kirim dua form: fallback ASCII + RFC5987 untuk browser modern
  return `attachment; filename="${sanitized}"; filename*=UTF-8''${encoded}`;
}

async function handleDownload(c: Context<{ Bindings: Env }>) {
  const slug = c.req.param("slug");
  const rangeHeader = c.req.header("Range");

  if (!slug) {
    return c.text("Not Found", 404);
  }

  const downloadService = new DownloadService(c.env);
  const downloadLogRepository = new DownloadLogRepository(c.env.DB);

  let fileForLogging: { id: number } | null = null;

  try {
    const probe = await downloadService.streamBySlug(slug, null);
    fileForLogging = { id: probe.file.id };

    const range = parseRangeHeader(rangeHeader, probe.totalFileSizeBytes);

    if (!range) {
      void downloadLogRepository.create({
        fileId: probe.file.id,
        ipAddress: c.req.header("CF-Connecting-IP") ?? "unknown",
        userAgent: c.req.header("User-Agent") ?? null,
        bytesServed: probe.totalFileSizeBytes,
        status: "completed",
      });

      c.header("Content-Type", probe.mimeType);
      c.header("Content-Length", String(probe.totalFileSizeBytes));
      c.header("Accept-Ranges", "bytes");
      // FIX #7 applied:
      c.header("Content-Disposition", safeContentDisposition(probe.file.filename));
      // SECURITY FIX #8: tambah Cache-Control untuk file publik
      // Ini opsional — sesuaikan ttl dengan kebutuhan. Tanpa ini browser bisa cache
      // file yang kemudian visibility-nya diubah jadi private.
      c.header("Cache-Control", "public, max-age=3600");
      return c.body(probe.stream, 200);
    }

    const result = await downloadService.streamBySlug(slug, range);

    void downloadLogRepository.create({
      fileId: probe.file.id,
      ipAddress: c.req.header("CF-Connecting-IP") ?? "unknown",
      userAgent: c.req.header("User-Agent") ?? null,
      bytesServed: result.sizeBytes,
      status: "partial",
    });

    c.header("Content-Type", result.mimeType);
    c.header("Content-Length", String(result.sizeBytes));
    c.header("Accept-Ranges", "bytes");
    c.header("Content-Range", `bytes ${range.start}-${range.end}/${result.totalFileSizeBytes}`);
    // FIX #7 applied:
    c.header("Content-Disposition", safeContentDisposition(result.file.filename));
    return c.body(result.stream, 206);
  } catch (error) {
    if (error instanceof FileNotAccessibleError) {
      return c.text("Not Found", 404);
    }

    if (fileForLogging) {
      void downloadLogRepository.create({
        fileId: fileForLogging.id,
        ipAddress: c.req.header("CF-Connecting-IP") ?? "unknown",
        userAgent: c.req.header("User-Agent") ?? null,
        bytesServed: 0,
        status: "failed",
      });
    }

    throw error;
  }
}

downloadRoutes.get("/download/:slug", handleDownload);
downloadRoutes.get("/:slug{.+\\..+}", handleDownload);

export { downloadRoutes };
