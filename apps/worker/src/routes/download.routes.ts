import { Hono, type Context } from "hono";
import { parseRangeHeader } from "../utils/range-parser";
import { extractRealIp } from "../utils/ip-parser";
import { resolveCountry } from "../utils/geo-resolver";
import {
  DownloadService,
  FileNotAccessibleError,
} from "../services/download.service";
import { DownloadLogRepository } from "../database/download-log.repository";
import { SettingsRepository } from "../database/settings.repository";
import type { Env } from "../config/env";

/**
 * Public download routes â€” mounted WITHOUT the /api prefix.
 * Supports Range requests (206 Partial Content) for resume-capable downloads.
 * Private/hidden files return generic 404 â€” no 403 leakage.
 */
const downloadRoutes = new Hono<{ Bindings: Env }>();

// â”€â”€â”€ SECURITY FIX #7: Content-Disposition header injection via filename â”€â”€â”€â”€
function safeContentDisposition(filename: string): string {
  const sanitized = filename.replace(/[\x00-\x1f\x7f]/g, "").replace(/"/g, "'");
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${sanitized}"; filename*=UTF-8''${encoded}`;
}

async function handleDownload(c: Context<{ Bindings: Env }>) {
  const shareCode = c.req.param("shareCode");
  const slug = c.req.param("slug");
  const customPrefix = c.req.param("customPrefix"); // might be undefined
  const rangeHeader = c.req.header("Range");

  if (!slug || !shareCode) {
    return c.text("Not Found", 404);
  }

  // Strict endpoint verification
  const settingsRepo = new SettingsRepository(c.env.DB);
  const activeEndpoint =
    (await settingsRepo.get("download_endpoint")) ?? "default";

  const path = c.req.path.replace(/\/+/g, "/"); // normalize path

  let isMatch = false;
  if (activeEndpoint === "download") {
    isMatch = path === `/${shareCode}/download/${slug}`;
  } else if (activeEndpoint === "dl") {
    isMatch = path === `/${shareCode}/dl/${slug}`;
  } else if (activeEndpoint === "get") {
    isMatch = path === `/${shareCode}/get/${slug}`;
  } else if (activeEndpoint === "query") {
    // Check if query param exists (either ?download or ?download=...)
    const hasQuery =
      c.req.query("download") !== undefined ||
      c.req.queries("download") !== undefined;
    isMatch = path === `/${shareCode}/${slug}` && hasQuery;
  } else if (activeEndpoint.startsWith("custom:")) {
    const prefix = activeEndpoint.slice(7);
    isMatch = path === `/${shareCode}/${prefix}/${slug}`;
  } else {
    // default: must be exactly /:shareCode/:slug/download
    isMatch = path === `/${shareCode}/${slug}/download`;
  }

  if (!isMatch) {
    return c.text("Not Found", 404);
  }

  const downloadService = new DownloadService(c.env);
  const downloadLogRepository = new DownloadLogRepository(c.env.DB);

  try {
    // Ambil metadata file dulu (ringan, tanpa stream ke Google)
    const fileInfo = await downloadService.getFileInfo(slug);
    if (!fileInfo || fileInfo.shareCode !== shareCode) {
      return c.text("Not Found", 404);
    }


    // Ukuran dari DB sebagai acuan awal untuk parseRangeHeader.
    // Kalau 0/salah, kita akan overwrite dari Google Drive response nanti.
    const dbSize = fileInfo.sizeBytes;

    const range = parseRangeHeader(
      rangeHeader,
      dbSize > 0 ? dbSize : Number.MAX_SAFE_INTEGER,
    );

    // Stream file dari Google Drive (1 request saja â€” tidak ada lagi request metadata terpisah)
    const result = await downloadService.streamBySlug(slug, range);

    // â”€â”€ Sumber kebenaran ukuran file (prioritas dari tinggi ke rendah) â”€â”€â”€â”€â”€â”€â”€â”€
    // 1. Google Drive Content-Range header â†’ paling akurat, langsung dari storage Google
    // 2. Google Drive Content-Length header â†’ fallback jika tidak ada Content-Range
    // 3. DB sizeBytes â†’ fallback terakhir jika Google tidak mengembalikan header size
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let totalSize = dbSize;

    // Parse total dari Content-Range Google: "bytes START-END/TOTAL" â†’ TOTAL
    if (result.contentRange) {
      const match = result.contentRange.match(/\/(\d+)$/);
      if (match) totalSize = Number(match[1]);
    } else if (result.contentLength && !range) {
      // Tidak ada Content-Range tapi ada Content-Length â†’ ini ukuran full file
      totalSize = result.contentLength;
    }

    // Jika DB masih 0 tapi kita sudah dapat ukuran dari Google, update DB async
    if ((!dbSize || dbSize <= 0) && totalSize > 0) {
      c.executionCtx.waitUntil(
        downloadService.fixFileSizeInDb(fileInfo.id, totalSize),
      );
    }

    const ipAddress = extractRealIp(c);
    const cfCountry = (c.req.raw.cf?.country as string) || null;
    const userAgent = c.req.header("User-Agent") ?? null;

    // â”€â”€ Log hanya saat request pertama (byte 0 atau tanpa Range header) â”€â”€â”€â”€â”€â”€â”€
    // Dikombinasikan dengan createIfNotDuplicate (window 5 menit per file+IP)
    // ini memastikan 1 download = 1 log, tanpa mengubah cara streaming.
    const isFirstRequest = !range || range.start === 0;
    if (isFirstRequest) {
      c.executionCtx.waitUntil(
        resolveCountry(ipAddress, cfCountry).then((country) =>
          downloadLogRepository.createIfNotDuplicate({
            fileId: fileInfo.id,
            ipAddress,
            country,
            userAgent,
            bytesServed: totalSize,
            status: "completed",
          }),
        ),
      );
    }

    // â”€â”€ Header response â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const headers = new Headers();
    headers.set("Content-Type", fileInfo.mimeType || result.mimeType);
    headers.set("Accept-Ranges", "bytes");
    headers.set(
      "Content-Disposition",
      safeContentDisposition(fileInfo.filename),
    );
    headers.set("Cache-Control", "public, max-age=3600, no-transform");

    if (range && result.contentRange) {
      // Resume download: gunakan Content-Range PERSIS dari Google (paling akurat)
      const chunkSize = range.end - range.start + 1;
      headers.set("Content-Length", String(result.contentLength ?? chunkSize));
      headers.set("Content-Range", result.contentRange);
    } else if (range) {
      // Resume tapi Google tidak beri Content-Range â€” hitung manual
      const chunkSize = range.end - range.start + 1;
      headers.set("Content-Length", String(chunkSize));
      headers.set(
        "Content-Range",
        `bytes ${range.start}-${range.end}/${totalSize}`,
      );
    } else {
      // Download penuh â€” selalu 206 agar Cloudflare CDN tidak strip Content-Length
      headers.set("Content-Length", String(totalSize));
      headers.set("Content-Range", `bytes 0-${totalSize - 1}/${totalSize}`);
    }

    // encodeBody:"manual" â†’ matikan chunked di Worker level
    // status 206        â†’ matikan chunked di Cloudflare CDN level
    return new Response(result.stream, {
      status: 206,
      headers,
      // @ts-ignore â€” Cloudflare Workers specific flag
      encodeBody: "manual",
    });
  } catch (error) {
    if (error instanceof FileNotAccessibleError) {
      return c.text("Not Found", 404);
    }
    throw error;
  }
}

// â”€â”€â”€ Download endpoint routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Semua format endpoint didaftarkan sekaligus agar link lama tidak rusak
// ketika admin mengganti setting. Setting download_endpoint di dashboard
// hanya mengontrol format URL mana yang ditampilkan di UI/API file list.
//
// Supported formats:
//   1. /filename.ext             (default â€” catch-all by extension)
//   2. /download/filename.ext    (explicit /download/ prefix)
//   3. /dl/filename.ext          (/dl/ prefix)
//   4. /get/filename.ext         (/get/ prefix)
//   5. /filename.ext?download    (query param â€” handled by catch-all)
//   6. /{custom}/filename.ext    (custom prefix â€” registered for common ones below)
//      For arbitrary custom prefixes, the slug catch-all at (1) may not match;
//      the custom prefix route is registered in index.ts via env setting if needed.
//
// NOTE: Route 1 /:slug{...} MUST be last to avoid shadowing prefixed routes.


// We use generic param names and let handleDownload parse them
downloadRoutes.get("/:shareCode/download/:slug{.+}", handleDownload);
downloadRoutes.get("/:shareCode/dl/:slug{.+}", handleDownload);
downloadRoutes.get("/:shareCode/get/:slug{.+}", handleDownload);
downloadRoutes.get("/:shareCode/:customPrefix/:slug{.+}", handleDownload); // For custom prefix
downloadRoutes.get("/:shareCode/:slug{[^/]+\\.[^/]+}/download", handleDownload); // Default
downloadRoutes.get("/:shareCode/:slug{[^/]+\\.[^/]+}", handleDownload); // For ?download query param



export { downloadRoutes };

/**
 * Build a public download URL for a file given the current download_endpoint setting.
 * Used by the worker API endpoints that return file metadata.
 *
 * @param filename   e.g. "report.pdf"
 * @param endpoint   the value of settings.download_endpoint
 * @returns          URL path (without origin) e.g. "/dl/report.pdf"
 */
export function buildDownloadPath(
  filename: string,
  shareCode: string,
  endpoint: string,
): string {
  if (endpoint === "download") return `/${shareCode}/download/${filename}`;
  if (endpoint === "dl") return `/${shareCode}/dl/${filename}`;
  if (endpoint === "get") return `/${shareCode}/get/${filename}`;
  if (endpoint === "query") return `/${shareCode}/${filename}?download`;
  if (endpoint.startsWith("custom:")) {
    const prefix = endpoint.slice(7);
    return `/${shareCode}/${prefix}/${filename}`;
  }
  // default
  return `/${shareCode}/${filename}/download`;
}
