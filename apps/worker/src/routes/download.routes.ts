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
import { enforceDownloadSecurity } from "../utils/security";
import type { Env } from "../config/env";

const downloadRoutes = new Hono<{ Bindings: Env }>();

function safeContentDisposition(filename: string): string {
  const sanitized = filename.replace(/[\x00-\x1f\x7f]/g, "").replace(/"/g, "'");
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${sanitized}"; filename*=UTF-8''${encoded}`;
}

async function handleDownload(c: Context<{ Bindings: Env }>) {
  try {
    // Enforce CLI blocking and download rate limits
    const securityCheck = await enforceDownloadSecurity(c);
    if (securityCheck) return securityCheck;

    const shareCode = c.req.param("shareCode");
    const slug = c.req.param("slug");
    const rangeHeader = c.req.header("Range");

    if (!slug || !shareCode) {
      return c.text("Not Found", 404);
    }

    // Strict endpoint verification
    const settingsRepo = new SettingsRepository(c.env.DB);
    const activeEndpoint = (await settingsRepo.get("download_endpoint")) ?? "default";
    const path = c.req.path.replace(/\/+/g, "/"); // normalize path

    let isMatch = false;
    if (activeEndpoint === "download") {
      isMatch = path === `/${shareCode}/download/${slug}`;
    } else if (activeEndpoint === "dl") {
      isMatch = path === `/${shareCode}/dl/${slug}`;
    } else if (activeEndpoint === "get") {
      isMatch = path === `/${shareCode}/get/${slug}`;
    } else if (activeEndpoint === "query") {
      const hasQuery = c.req.query("download") !== undefined || c.req.queries("download") !== undefined;
      isMatch = path === `/${shareCode}/${slug}` && hasQuery;
    } else if (activeEndpoint.startsWith("custom:")) {
      const prefix = activeEndpoint.slice(7);
      isMatch = path === `/${shareCode}/${prefix}/${slug}`;
    } else {
      isMatch = path === `/${shareCode}/${slug}/download`;
    }

    if (!isMatch) {
      return c.text("Not Found", 404);
    }

    const downloadService = new DownloadService(c.env);
    const downloadLogRepository = new DownloadLogRepository(c.env.DB);

    // Ambil metadata file dulu
    const fileInfo = await downloadService.getFileInfo(slug);
    if (!fileInfo || fileInfo.shareCode !== shareCode) {
      return c.text("Not Found", 404);
    }

    const dbSize = fileInfo.sizeBytes;
    const range = parseRangeHeader(rangeHeader, dbSize > 0 ? dbSize : Number.MAX_SAFE_INTEGER);

    // Stream file dari Google Drive
    const result = await downloadService.streamBySlug(slug, range);

    let totalSize = dbSize;
    if (result.contentRange) {
      const match = result.contentRange.match(/\/(\d+)$/);
      if (match) totalSize = Number(match[1]);
    } else if (result.contentLength && !range) {
      totalSize = result.contentLength;
    }

    if ((!dbSize || dbSize <= 0) && totalSize > 0) {
      c.executionCtx.waitUntil(
        downloadService.fixFileSizeInDb(fileInfo.id, totalSize),
      );
    }

    const ipAddress = extractRealIp(c);
    const cfCountry = (c.req.raw.cf?.country as string) || null;
    const userAgent = c.req.header("User-Agent") ?? null;

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

    const headers = new Headers();
    headers.set("Content-Type", fileInfo.mimeType || result.mimeType);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Content-Disposition", safeContentDisposition(fileInfo.filename));
    headers.set("Cache-Control", "public, max-age=3600, no-transform");

    if (range && result.contentRange) {
      const chunkSize = range.end - range.start + 1;
      headers.set("Content-Length", String(result.contentLength ?? chunkSize));
      headers.set("Content-Range", result.contentRange);
    } else if (range) {
      const chunkSize = range.end - range.start + 1;
      headers.set("Content-Length", String(chunkSize));
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${totalSize}`);
    } else {
      headers.set("Content-Length", String(totalSize));
    }

    return new Response(result.stream, {
      status: range ? 206 : 200,
      headers,
      // @ts-ignore
      encodeBody: "manual",
    });
  } catch (error: any) {
    if (
      error instanceof FileNotAccessibleError ||
      error?.message === "FILE_NOT_AVAILABLE"
    ) {
      return c.text("Not Found", 404);
    }
    return c.text("Not Found", 404);
  }
}

downloadRoutes.get("/:shareCode/download/:slug{.+}", handleDownload);
downloadRoutes.get("/:shareCode/dl/:slug{.+}", handleDownload);
downloadRoutes.get("/:shareCode/get/:slug{.+}", handleDownload);
downloadRoutes.get("/:shareCode/:customPrefix/:slug{.+}", handleDownload);
downloadRoutes.get("/:shareCode/:slug{[^/]+\\.[^/]+}/download", handleDownload);
downloadRoutes.get("/:shareCode/:slug{[^/]+\\.[^/]+}", handleDownload);

export { downloadRoutes };

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
  return `/${shareCode}/${filename}/download`;
}
