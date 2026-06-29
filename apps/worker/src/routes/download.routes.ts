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

  try {
    // Ambil metadata file dulu (ringan, tanpa stream)
    const fileInfo = await downloadService.getFileInfo(slug);
    if (!fileInfo) {
      return c.text("Not Found", 404);
    }

    // Gunakan sizeBytes dari DB sebagai sumber kebenaran ukuran file
    // Ini memastikan Content-Length selalu ada dan benar meskipun provider
    // gagal mengembalikan ukuran (misal Google Docs native files)
    const totalSize = fileInfo.sizeBytes;

    const range = parseRangeHeader(rangeHeader, totalSize);

    // Stream sekali saja — tidak perlu dua kali request ke Google Drive
    const result = await downloadService.streamBySlug(slug, range);

    // Log download (fire-and-forget)
    void downloadLogRepository.create({
      fileId: fileInfo.id,
      ipAddress: c.req.header("CF-Connecting-IP") ?? "unknown",
      userAgent: c.req.header("User-Agent") ?? null,
      bytesServed: range ? (range.end - range.start + 1) : totalSize,
      status: range ? "partial" : "completed",
    });

    // ── Kenapa SELALU 206? ────────────────────────────────────────────────────
    // Cloudflare CDN (edge layer di depan Worker) terkadang menghapus
    // Content-Length dari response 200 streaming dan menggantinya dengan
    // Transfer-Encoding: chunked. Ini yang menyebabkan browser Android
    // menampilkan "? / ?" alih-alih ukuran file sebenarnya.
    //
    // Trik dari r2-hosting-fixed: selalu kembalikan 206 Partial Content +
    // Content-Range, karena Cloudflare CDN TIDAK berani menghapus Content-Length
    // dari response 206 (melanggar RFC 7233). IDM, Android browser, semua
    // download manager menangani 206 dengan benar — bahkan untuk download penuh.
    // ─────────────────────────────────────────────────────────────────────────

    const headers = new Headers();
    headers.set("Content-Type", fileInfo.mimeType || result.mimeType);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Content-Disposition", safeContentDisposition(fileInfo.filename));
    headers.set("Cache-Control", "public, max-age=3600, no-transform");

    if (range) {
      // Client meminta range tertentu (resume/lanjut dari titik tertentu)
      const chunkSize = range.end - range.start + 1;
      headers.set("Content-Length", String(chunkSize));
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${totalSize}`);
    } else {
      // Download penuh — tetap 206 dengan range 0 sampai akhir file
      // agar Cloudflare CDN tidak menghapus Content-Length.
      headers.set("Content-Length", String(totalSize));
      headers.set("Content-Range", `bytes 0-${totalSize - 1}/${totalSize}`);
    }

    // encodeBody: "manual" = matikan chunked encoding di level Worker itu sendiri.
    // Status 206 = matikan chunked encoding di level Cloudflare CDN.
    // Keduanya diperlukan agar Content-Length sampai ke browser dengan utuh.
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
// Route 2: catch-all slug yang mengandung titik (ekstensi file) — misal /file.apk, /v1.2.3.zip
// Pattern .+ menangkap semua karakter termasuk beberapa titik
downloadRoutes.get("/:slug{[^/]+\\.[^/]+}", handleDownload);

export { downloadRoutes };
