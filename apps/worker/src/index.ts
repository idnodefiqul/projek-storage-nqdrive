import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./config/env";
import { registerStorageProviders } from "./config/bootstrap";
import { authRoutes, systemStateRoutes, meRoutes } from "./routes/auth.routes";
import { storageAccountRoutes } from "./routes/storage-account.routes";
import { migrationRoutes } from "./routes/migration.routes";
import { folderRoutes } from "./routes/folder.routes";
import { fileRoutes } from "./routes/file.routes";
import { uploadRoutes } from "./routes/upload.routes";
import { downloadRoutes, buildDownloadPath } from "./routes/download.routes";
import { logRoutes } from "./routes/log.routes";
import { apiKeyRoutes } from "./routes/api-key.routes";
import { dashboardRoutes } from "./routes/dashboard.routes";
import { trashRoutes } from "./routes/trash.routes";
import { settingsRoutes } from "./routes/settings.routes";
import { securityApiRoutes } from "./routes/security.routes";
import { auditLogRoutes } from "./routes/audit-log.routes";
import { SettingsRepository } from "./database/settings.repository";
import { DownloadService, FileNotAccessibleError } from "./services/download.service";
import { DownloadLogRepository } from "./database/download-log.repository";
import { parseRangeHeader } from "./utils/range-parser";
import { extractRealIp } from "./utils/ip-parser";
import { resolveCountry } from "./utils/geo-resolver";
import { syncDriveAccounts } from "./cron/sync-drive-accounts";
import { purgeExpiredTrash } from "./cron/purge-trash";
import { processRunningMigrations } from "./cron/process-migrations";
import { enforceDownloadSecurity } from "./utils/security";

/**
 * NQDRIVE Worker entry point.
 */
const app = new Hono<{ Bindings: Env }>();

app.onError((err, c) => {
  console.error("Unhandled error:", err);

  const isProduction = c.env.APP_ENV === "production";

  return c.json(
    {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: isProduction ? "Internal server error" : err.message,
        ...(isProduction ? {} : { stack: err.stack }),
      },
    },
    500
  );
});

// CORS: strict full-origin allowlist - hanya origin eksplisit yang diizinkan.
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
      "Content-Range",
      "Content-Length",
    ],
    exposeHeaders: ["Set-Cookie"],
    credentials: true, // Required - auth uses HttpOnly session cookie.
    maxAge: 86400,
  })
);

// Register all StorageProvider implementations once per request.
app.use("*", async (c, next) => {
  registerStorageProviders(c.env);
  await next();
});

// - Absolute API Access Guard -
// Semua path yang dilindungi WAJIB punya salah satu dari:
//   1. Header X-App-Client: nqdrive-web  (request dari React web app kita)
//   2. Header Authorization: Bearer xxx  (request dari API key programatik)
//
// Kondisi apapun - address bar, DevTools console, Postman, curl - tanpa
// salah satu dari dua header di atas = DITOLAK dengan blank 404.
// OPTIONS (CORS preflight) dikecualikan agar CORS tetap berjalan normal.

const PROTECTED_PATHS = ["/api/*", "/captcha", "/captcha/*", "/config", "/resource/*", "/system/*"];

const apiGuardMiddleware = async (
  c: Context<{ Bindings: Env }>,
  next: () => Promise<void>
) => {
  if (c.req.method === "OPTIONS") return next();

  const pathname = new URL(c.req.url).pathname;

  // Allow preview-stream without auth headers (uses signed token in query)
  if (pathname === "/api/files/stream") return next();

  // Allow Google OAuth callback ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â Google's redirect can't send X-App-Client.
  // Protected instead by the signed `state` JWT verified inside the handler.
  if (pathname === "/api/storage/accounts/oauth/callback") return next();

  const appClient    = c.req.header("X-App-Client");
  const authBearer   = c.req.header("Authorization");
  const secFetchSite = c.req.header("Sec-Fetch-Site");
  const origin       = c.req.header("Origin");

  // (3) Jalur API key programatik = jalur legitimate terpisah.
  // Lolos TANPA perlu Sec-Fetch-Site/Origin sama sekali.
  const isApiKeyAccess = typeof authBearer === "string" && authBearer.startsWith("Bearer ");
  if (isApiKeyAccess) return next();

  // Jalur web app resmi: WAJIB X-App-Client (tetap) DAN bukti request benar-benar
  // berasal dari browser same-origin - lapisan kedua yang tidak bisa dipalsukan
  // lewat JS/fetch() biasa dari luar browser.
  const isOfficialWebApp = appClient === "nqdrive-web";
  //   (1) Sec-Fetch-Site di-set otomatis oleh browser; JS/fetch() tidak bisa override.
  //       Request browser same-origin (lewat proxy Pages Function) => "same-origin".
  const isBrowserSameOrigin = secFetchSite === "same-origin";
  //   (2) Fallback: Origin cocok dengan allowlist resmi.
  const isAllowedOrigin = typeof origin === "string" && ALLOWED_ORIGINS.has(origin);

  if (isOfficialWebApp && (isBrowserSameOrigin || isAllowedOrigin)) {
    return next();
  }

  // Selain itu - termasuk curl/Postman yang cuma memalsukan X-App-Client tanpa
  // Sec-Fetch-Site/Origin yang valid - DITOLAK dengan blank 404.
  return new Response(null, { status: 404 });
};

for (const path of PROTECTED_PATHS) {
  app.use(path, apiGuardMiddleware);
}

// Root path: blank page
app.get("/", () => new Response(null, { status: 404 }));

app.route("/api/auth", authRoutes);
app.route("/api/me", meRoutes);
// storageAccountRoutes HARUS di-mount lebih dulu: callback OAuth Google di
// dalamnya terdaftar sebelum requireAuth, sedangkan migrationRoutes memasang
// requireAuth pada "*" — kalau dibalik, Google (tanpa cookie sesi) kena 401.
app.route("/api/storage", storageAccountRoutes);
app.route("/api/storage", migrationRoutes);
app.route("/api/folders", folderRoutes);
// Public preview stream - validates signed token, no auth/headers needed.
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

  // Forward browser Range header for true streaming (video seek, PDF partial load)
  const browserRange = c.req.header("Range");
  const driveHeaders: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Accept-Encoding": "identity",
  };
  if (browserRange) {
    driveHeaders["Range"] = browserRange;
  } else {
    driveHeaders["Range"] = "bytes=0-";
  }

  const driveRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${file.providerFileId}?alt=media&acknowledgeAbuse=true`,
    { headers: driveHeaders }
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

  // Forward Content-Range and Content-Length from Google Drive
  if (cr) {
    h.set("Content-Range", cr);
    const driveContentLength = driveRes.headers.get("Content-Length");
    if (driveContentLength) h.set("Content-Length", driveContentLength);
  } else if (totalSize > 0) {
    h.set("Content-Length", String(totalSize));
    h.set("Content-Range", `bytes 0-${totalSize - 1}/${totalSize}`);
  }

  const status = (driveRes.status === 206 || browserRange) ? 206 : 200;
  return new Response(driveRes.body, { status, headers: h, encodeBody: "manual" } as any);
});

app.route("/api/files", fileRoutes);
// POST /api/files/upload
app.route("/api/upload", uploadRoutes);
app.route("/api/logs", logRoutes);
app.route("/api/api-keys", apiKeyRoutes);
app.route("/api/dashboard", dashboardRoutes);
// Trash routes - manajemen Recycle Bin
app.route("/api/trash", trashRoutes);
// Settings routes - site name, download endpoint, dll
app.route("/api/settings", settingsRoutes);
// Security routes
app.route("/api/security", securityApiRoutes);
app.route("/api/audit-logs", auditLogRoutes);
// /captcha - public Turnstile config for login page only
app.get("/captcha", async (c) => {
  const clientHeader = c.req.header("X-App-Client");
  if (clientHeader !== "nqdrive-web") {
    return new Response(null, { status: 404 });
  }

  const repo = new SettingsRepository(c.env.DB);
  const settings = await repo.getMany(["turnstile_enabled", "turnstile_sitekey"]);

  c.header("Cache-Control", "no-store, no-cache, must-revalidate");
  return c.json({
    success: true,
    data: {
      turnstile_enabled: settings["turnstile_enabled"] === "true",
      turnstile_sitekey: settings["turnstile_sitekey"] ?? "",
    },
  });
});

// /config - public visual config for download page
app.get("/config", async (c) => {
  const clientHeader = c.req.header("X-App-Client");
  if (clientHeader !== "nqdrive-web") {
    return new Response(null, { status: 404 });
  }

  const repo = new SettingsRepository(c.env.DB);
  const settings = await repo.getMany(["brand_color", "theme_mode"]);

  c.header("Cache-Control", "no-store, no-cache, must-revalidate");
  return c.json({
    success: true,
    data: {
      brand_color: settings["brand_color"] ?? "",
      theme_mode: settings["theme_mode"] ?? "light",
    },
  });
});

app.get("/resource/:prefix/:shareCode/getlinkUrl", async (c) => {
  const clientHeader = c.req.header("X-App-Client");
  if (clientHeader !== "nqdrive-web") {
    return new Response(null, { status: 404 });
  }

  const prefix = c.req.param("prefix");
  const shareCode = c.req.param("shareCode");

  const repo = new SettingsRepository(c.env.DB);
  const prefixSetting = await repo.get("share_page_prefix") ?? "p";
  let expectedPrefix = prefixSetting;
  if (prefixSetting.startsWith("custom:")) expectedPrefix = prefixSetting.slice(7);

  if (prefix !== expectedPrefix) {
    return c.json({ success: false, error: { message: "File tidak ditemukan." } }, 404);
  }

  const file = await c.env.DB.prepare(
    `SELECT f.slug, a.refresh_token_encrypted
     FROM files f
     JOIN drive_accounts a ON f.drive_account_id = a.id
     WHERE f.share_code = ? AND f.deleted_at IS NULL AND f.visibility = 'public'`
  ).bind(shareCode).first<any>();

  if (!file || !file.refresh_token_encrypted) {
    return c.json({ success: false, error: { message: "File tidak ditemukan atau telah dihapus." } }, 404);
  }

  const downloadEndpoint = await repo.get("download_endpoint") ?? "default";
  const path = buildDownloadPath(file.slug, shareCode, downloadEndpoint);
  const origin = new URL(c.req.url).origin;
  const downloadUrl = `${origin}${path}`;

  return c.json({ success: true, data: { downloadUrl } });
});

// /resource/:prefix/:shareCode - public file metadata
app.get("/resource/:prefix/:shareCode", async (c) => {
  const clientHeader = c.req.header("X-App-Client");
  if (clientHeader !== "nqdrive-web") {
    return new Response(null, { status: 404 });
  }

  const prefix = c.req.param("prefix");
  const shareCode = c.req.param("shareCode");

  const repo = new SettingsRepository(c.env.DB);
  const prefixSetting = await repo.get("share_page_prefix") ?? "p";
  let expectedPrefix = prefixSetting;
  if (prefixSetting.startsWith("custom:")) expectedPrefix = prefixSetting.slice(7);

  if (prefix !== expectedPrefix) {
    return c.json({ success: false, error: { message: "File tidak ditemukan." } }, 404);
  }


  const file = await c.env.DB.prepare(
    `SELECT f.id, f.filename, f.size_bytes, f.mime_type, f.sha256_hash, f.slug, a.refresh_token_encrypted 
     FROM files f
     JOIN drive_accounts a ON f.drive_account_id = a.id
     WHERE f.share_code = ? AND f.deleted_at IS NULL AND f.visibility = 'public'`
  ).bind(shareCode).first<any>();

  // Sembunyikan halaman download sepenuhnya jika akun Google terputus
  if (!file || !file.refresh_token_encrypted) {
    return c.json({ success: false, error: { message: "File tidak ditemukan atau telah dihapus." } }, 404);
  }

  const dlCountRow = await c.env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM download_logs WHERE file_id = ?"
  ).bind(file.id).first<{ cnt: number }>();
  const downloadCount = dlCountRow?.cnt ?? 0;

  return c.json({
    success: true,
    data: {
      filename: file.filename,
      sizeBytes: file.size_bytes,
      mimeType: file.mime_type,
      sha256Hash: file.sha256_hash,
      slug: file.slug,
      downloadCount
    }
  });
});
// /system/state - setup status (sebelumnya /api/auth/setup-status)
app.route("/system", systemStateRoutes);

// Public download routes - mounted WITHOUT /api prefix on purpose.
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
    // Enforce CLI blocking and download rate limits
    const securityCheck = await enforceDownloadSecurity(c);
    if (securityCheck) return securityCheck;

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
      // @ts-ignore - Cloudflare Workers specific flag
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
    // Backstop migrasi antar akun: lanjutkan job yang masih berjalan
    // saat tidak ada tab dashboard terbuka
    ctx.waitUntil(processRunningMigrations(env));
  },
};
