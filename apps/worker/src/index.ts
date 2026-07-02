import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./config/env";
import { registerStorageProviders } from "./config/bootstrap";
import { authRoutes, systemStateRoutes, meRoutes } from "./routes/auth.routes";
import { storageAccountRoutes } from "./routes/storage-account.routes";
import { folderRoutes } from "./routes/folder.routes";
import { fileRoutes } from "./routes/file.routes";
import { uploadRoutes } from "./routes/upload.routes";
import { downloadRoutes } from "./routes/download.routes";
import { logRoutes } from "./routes/log.routes";
import { apiKeyRoutes } from "./routes/api-key.routes";
import { dashboardRoutes } from "./routes/dashboard.routes";
import { trashRoutes } from "./routes/trash.routes";
import { settingsRoutes, settingsPublicRoutes } from "./routes/settings.routes";
import { SettingsRepository } from "./database/settings.repository";
import { DownloadService, FileNotAccessibleError } from "./services/download.service";
import { DownloadLogRepository } from "./database/download-log.repository";
import { parseRangeHeader } from "./utils/range-parser";
import { extractRealIp } from "./utils/ip-parser";
import { resolveCountry } from "./utils/geo-resolver";
import { syncDriveAccounts } from "./cron/sync-drive-accounts";
import { purgeExpiredTrash } from "./cron/purge-trash";

/**
 * NQDRIVE Worker entry point.
 */
const app = new Hono<{ Bindings: Env }>();

// CORS: strict full-origin allowlist â€” hanya origin eksplisit yang diizinkan.
const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
  // Production domains
  "https://drive.fiqul.id",
  "https://www.drive.fiqul.id",
]);

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return null;
      return ALLOWED_ORIGINS.has(origin) ? origin : null;
    },
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "X-Filename",
      "X-File-Size",
      "X-Folder-Id",
      "X-App-Client",
      "X-File-SHA256",
    ],
    exposeHeaders: ["Set-Cookie"],
    credentials: true, // Required â€” auth uses HttpOnly session cookie.
    maxAge: 86400,
  })
);

// Register all StorageProvider implementations once per request.
app.use("*", async (c, next) => {
  registerStorageProviders(c.env);
  await next();
});

// â”€â”€â”€ Absolute API Access Guard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Semua path yang dilindungi WAJIB punya salah satu dari:
//   1. Header X-App-Client: nqdrive-web  (request dari React web app kita)
//   2. Header Authorization: Bearer xxx  (request dari API key programatik)
//
// Kondisi apapun â€” address bar, DevTools console, Postman, curl â€” tanpa
// salah satu dari dua header di atas = DITOLAK dengan blank 404.
// OPTIONS (CORS preflight) dikecualikan agar CORS tetap berjalan normal.

const PROTECTED_PATHS = ["/api/*", "/sitename", "/system/*"];

const apiGuardMiddleware = async (
  c: Parameters<typeof app.use>[1],
  next: () => Promise<void>
) => {
  if (c.req.method === "OPTIONS") return next();

  const appClient  = c.req.header("X-App-Client");
  const authBearer = c.req.header("Authorization");

  const isOfficialWebApp  = appClient === "nqdrive-web";
  const isApiKeyAccess    = typeof authBearer === "string" && authBearer.startsWith("Bearer ");

  // Blokir SEMUA request yang bukan dari web app atau API key â€” tanpa pengecualian
  if (!isOfficialWebApp && !isApiKeyAccess) {
    return new Response(null, { status: 404 });
  }

  await next();
};

for (const path of PROTECTED_PATHS) {
  app.use(path, apiGuardMiddleware);
}

// Root path: blank page
app.get("/", () => new Response(null, { status: 404 }));

app.route("/api/auth", authRoutes);
app.route("/api/me", meRoutes);
app.route("/api/storage", storageAccountRoutes);
app.route("/api/folders", folderRoutes);
app.route("/api/files", fileRoutes);
// POST /api/files/upload
app.route("/api/files", uploadRoutes);
app.route("/api/logs", logRoutes);
app.route("/api/api-keys", apiKeyRoutes);
app.route("/api/dashboard", dashboardRoutes);
// Trash routes â€” manajemen Recycle Bin
app.route("/api/trash", trashRoutes);
// Settings routes â€” site name, download endpoint, dll
app.route("/api/settings", settingsRoutes);
// /sitename â€” site name publik (sebelumnya /api/settings/public)
app.route("/sitename", settingsPublicRoutes);
// /system/state â€” setup status (sebelumnya /api/auth/setup-status)
app.route("/system", systemStateRoutes);

// Public download routes â€” mounted WITHOUT /api prefix on purpose.
// Mounted LAST so it never shadows /api/* routes.
app.route("/", downloadRoutes);

// Dynamic custom-prefix download route.
// This handles /{custom_prefix}/filename.ext when admin sets a custom download endpoint.
// It reads the setting per-request so changing it takes effect immediately.
app.get("/:prefix/:slug{[^/]+\\.[^/]+}", async (c) => {
  const prefix = c.req.param("prefix");
  // Only handle if it matches the configured custom prefix
  if (!prefix || prefix.startsWith("api") || prefix.startsWith("_")) {
    return c.text("Not Found", 404);
  }
  const settingsRepo = new SettingsRepository(c.env.DB);
  const endpoint = await settingsRepo.get("download_endpoint");
  if (!endpoint || !endpoint.startsWith("custom:")) {
    return c.text("Not Found", 404);
  }
  const customPrefix = endpoint.slice(7);
  if (customPrefix !== prefix) {
    return c.text("Not Found", 404);
  }

  const slug = c.req.param("slug");
  const rangeHeader = c.req.header("Range");
  const downloadService = new DownloadService(c.env);
  const downloadLogRepository = new DownloadLogRepository(c.env.DB);

  try {
    const fileInfo = await downloadService.getFileInfo(slug);
    if (!fileInfo) return c.text("Not Found", 404);

    const dbSize = fileInfo.sizeBytes;
    const range = parseRangeHeader(rangeHeader, dbSize > 0 ? dbSize : Number.MAX_SAFE_INTEGER);
    const result = await downloadService.streamBySlug(slug, range);

    let totalSize = dbSize;
    if (result.contentRange) {
      const match = result.contentRange.match(/\/(\d+)$/);
      if (match) totalSize = Number(match[1]);
    } else if (result.contentLength && !range) {
      totalSize = result.contentLength;
    }
    if ((!dbSize || dbSize <= 0) && totalSize > 0) {
      c.executionCtx.waitUntil(downloadService.fixFileSizeInDb(fileInfo.id, totalSize));
    }

    const ipAddress = extractRealIp(c);
    const cfCountry = (c.req.raw.cf?.country as string) || null;
    const userAgent = c.req.header("User-Agent") ?? null;
    const isFirstRequest = !range || range.start === 0;
    if (isFirstRequest) {
      c.executionCtx.waitUntil(
        resolveCountry(ipAddress, cfCountry).then((country) =>
          downloadLogRepository.createIfNotDuplicate({
            fileId: fileInfo.id, ipAddress, country, userAgent,
            bytesServed: totalSize, status: "completed",
          })
        )
      );
    }

    const sanitized = fileInfo.filename.replace(/[\x00-\x1f\x7f]/g, "").replace(/"/g, "'");
    const encoded = encodeURIComponent(fileInfo.filename);
    const headers = new Headers();
    headers.set("Content-Type", fileInfo.mimeType || result.mimeType);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Content-Disposition", `attachment; filename="${sanitized}"; filename*=UTF-8''${encoded}`);
    headers.set("Cache-Control", "public, max-age=3600, no-transform");

    if (range && result.contentRange) {
      headers.set("Content-Length", String(result.contentLength ?? (range.end - range.start + 1)));
      headers.set("Content-Range", result.contentRange);
    } else if (range) {
      headers.set("Content-Length", String(range.end - range.start + 1));
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${totalSize}`);
    } else {
      headers.set("Content-Length", String(totalSize));
      headers.set("Content-Range", `bytes 0-${totalSize - 1}/${totalSize}`);
    }

    return new Response(result.stream, {
      status: 206, headers,
      // @ts-ignore â€” Cloudflare Workers specific flag
      encodeBody: "manual",
    });
  } catch (error) {
    if (error instanceof FileNotAccessibleError) return c.text("Not Found", 404);
    throw error;
  }
});

export default {
  fetch: app.fetch,

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    registerStorageProviders(env);
    ctx.waitUntil(syncDriveAccounts(env));
    // Auto-purge item Trash yang sudah lebih dari 30 hari
    ctx.waitUntil(purgeExpiredTrash(env));
  },
};
