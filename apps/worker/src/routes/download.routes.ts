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
function safeContentDisposition(filename: string): string {
  const sanitized = filename.replace(/[\x00-\x1f\x7f]/g, "").replace(/"/g, "'");
  const encoded = encodeURIComponent(filename);
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

  try {
    // Ambil metadata file dulu (ringan, tanpa stream ke Google)
    const fileInfo = await downloadService.getFileInfo(slug);
    if (!fileInfo) {
      return c.text("Not Found", 404);
    }

    // Ukuran dari DB sebagai acuan awal untuk parseRangeHeader.
    // Kalau 0/salah, kita akan overwrite dari Google Drive response nanti.
    const dbSize = fileInfo.sizeBytes;

    const range = parseRangeHeader(rangeHeader, dbSize > 0 ? dbSize : Number.MAX_SAFE_INTEGER);

    // Stream file dari Google Drive (1 request saja — tidak ada lagi request metadata terpisah)
    const result = await downloadService.streamBySlug(slug, range);

    // ── Sumber kebenaran ukuran file (prioritas dari tinggi ke rendah) ────────
    // 1. Google Drive Content-Range header → paling akurat, langsung dari storage Google
    // 2. Google Drive Content-Length header → fallback jika tidak ada Content-Range
    // 3. DB sizeBytes → fallback terakhir jika Google tidak mengembalikan header size
    // ─────────────────────────────────────────────────────────────────────────
    let totalSize = dbSize;

    // Parse total dari Content-Range Google: "bytes START-END/TOTAL" → TOTAL
    if (result.contentRange) {
      const match = result.contentRange.match(/\/(\d+)$/);
      if (match) totalSize = Number(match[1]);
    } else if (result.contentLength && !range) {
      // Tidak ada Content-Range tapi ada Content-Length → ini ukuran full file
      totalSize = result.contentLength;
    }

    // Jika DB masih 0 tapi kita sudah dapat ukuran dari Google, update DB async
    if ((!dbSize || dbSize <= 0) && totalSize > 0) {
      void downloadService.fixFileSizeInDb(fileInfo.id, totalSize);
    }

    // Log download (fire-and-forget)
    void downloadLogRepository.create({
      fileId: fileInfo.id,
      ipAddress: c.req.header("CF-Connecting-IP") ?? "unknown",
      userAgent: c.req.header("User-Agent") ?? null,
      bytesServed: range ? (range.end - range.start + 1) : totalSize,
      status: range ? "partial" : "completed",
    });

    // ── Header response ───────────────────────────────────────────────────────
    const headers = new Headers();
    headers.set("Content-Type", fileInfo.mimeType || result.mimeType);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Content-Disposition", safeContentDisposition(fileInfo.filename));
    headers.set("Cache-Control", "public, max-age=3600, no-transform");

    if (range && result.contentRange) {
      // Resume download: gunakan Content-Range PERSIS dari Google (paling akurat)
      const chunkSize = range.end - range.start + 1;
      headers.set("Content-Length", String(result.contentLength ?? chunkSize));
      headers.set("Content-Range", result.contentRange);
    } else if (range) {
      // Resume tapi Google tidak beri Content-Range — hitung manual
      const chunkSize = range.end - range.start + 1;
      headers.set("Content-Length", String(chunkSize));
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${totalSize}`);
    } else {
      // Download penuh — selalu 206 agar Cloudflare CDN tidak strip Content-Length
      headers.set("Content-Length", String(totalSize));
      headers.set("Content-Range", `bytes 0-${totalSize - 1}/${totalSize}`);
    }

    // encodeBody:"manual" → matikan chunked di Worker level
    // status 206        → matikan chunked di Cloudflare CDN level
    return new Response(result.stream, {
      status: 206,
      headers,
      // @ts-ignore — Cloudflare Workers specific flag
      encodeBody: "manual",
    });

  } catch (error) {
    if (error instanceof FileNotAccessibleError) {
      return c.text("Not Found", 404);
    }
    throw error;
  }
}

// Route 1: explicit /download/:slug fallback
downloadRoutes.get("/download/:slug{.+}", handleDownload);
// Route 2: catch-all slug yang mengandung titik (ekstensi file)
downloadRoutes.get("/:slug{[^/]+\\.[^/]+}", handleDownload);

export { downloadRoutes };
