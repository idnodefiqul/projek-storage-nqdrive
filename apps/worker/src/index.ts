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
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
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

  // Allow preview-stream without auth headers (uses signed token in query)
  if (new URL(c.req.url).pathname === "/api/files/stream") return next();

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
// Public preview stream — validates signed token, no auth/headers needed.
// Used by <img src> and <video src> in the dashboard.
app.get("/api/files/stream", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.text("Missing token", 400);

  const parts = token.split(":");
  if (parts.length !== 3) return c.text("Invalid token", 403);

  const [fileIdStr, expiryStr, sigHex] = parts;
  const fileId = Number(fileIdStr);
  const expiry = Number(expiryStr);

  if (isNaN(fileId) || isNaN(expiry)) return c.text("Invalid token", 403);
  if (Math.floor(Date.now() / 1000) > expiry) return c.text("Token expired", 403);

  const data = `${fileId}:${expiry}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(c.env.JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const sigBytes = new Uint8Array(sigHex!.match(/.{2}/g)!.map(h => parseInt(h, 16)));
  const valid = await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(data));
  if (!valid) return c.text("Invalid token", 403);

  const { FileRepository } = await import("./database/file.repository");
  const { DriveAccountRepository } = await import("./database/drive-account.repository");
  const { GoogleAccountConnectionService } = await import("./services/google-account-connection.service");

  const fileRepo = new FileRepository(c.env.DB);
  const file = await fileRepo.findById(fileId);
  if (!file) return c.text("Not Found", 404);

  const driveRepo = new DriveAccountRepository(c.env.DB);
  const account = await driveRepo.findById(file.driveAccountId);
  if (!account) return c.text("Not Found", 404);

  const connService = new GoogleAccountConnectionService(c.env);
  const accessToken = await connService.getValidAccessToken(account);

  const driveRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${file.providerFileId}?alt=media&acknowledgeAbuse=true`,
    { headers: { Authorization: `Bearer ${accessToken}`, "Accept-Encoding": "identity", Range: "bytes=0-" } }
  );

  if (!driveRes.ok && driveRes.status !== 206) return c.text("Drive error", 502);
  if (!driveRes.body) return c.text("No body", 502);

  const ct = file.mimeType || driveRes.headers.get("Content-Type") || "application/octet-stream";
  let totalSize = 0;
  const cr = driveRes.headers.get("Content-Range");
  if (cr) { const m = cr.match(/\/(\d+)$/); if (m) totalSize = Number(m[1]); }
  if (!totalSize) { const cl = driveRes.headers.get("Content-Length"); if (cl) totalSize = Number(cl); }

  const h = new Headers();
  h.set("Content-Type", ct);
  h.set("Cache-Control", "private, max-age=300");
  h.set("Accept-Ranges", "bytes");
  if (totalSize > 0) { h.set("Content-Length", String(totalSize)); h.set("Content-Range", `bytes 0-${totalSize - 1}/${totalSize}`); }

  return new Response(driveRes.body, { status: totalSize > 0 ? 206 : 200, headers: h, encodeBody: "manual" } as any);
});

app.route("/api/files", fileRoutes);
// POST /api/files/upload
app.route("/api/upload", uploadRoutes);
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
