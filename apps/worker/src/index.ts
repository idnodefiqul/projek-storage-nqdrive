import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./config/env";
import { registerStorageProviders } from "./config/bootstrap";
import { authRoutes } from "./routes/auth.routes";
import { storageAccountRoutes } from "./routes/storage-account.routes";
import { folderRoutes } from "./routes/folder.routes";
import { fileRoutes } from "./routes/file.routes";
import { uploadRoutes } from "./routes/upload.routes";
import { downloadRoutes } from "./routes/download.routes";
import { logRoutes } from "./routes/log.routes";
import { apiKeyRoutes } from "./routes/api-key.routes";
import { syncDriveAccounts } from "./cron/sync-drive-accounts";

/**
 * NQDRIVE Worker entry point.
 */
const app = new Hono<{ Bindings: Env }>();

// CORS: strict full-origin allowlist — hanya origin eksplisit yang diizinkan.
// origin.endsWith(".pages.dev") sebelumnya terlalu permisif karena membolehkan
// domain Cloudflare Pages milik siapapun (attacker.evil.pages.dev juga lolos).
// Sekarang pakai Set untuk lookup O(1) dan mudah ditambah domain baru.
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
    ],
    exposeHeaders: ["Set-Cookie"],
    credentials: true, // Required — auth uses HttpOnly session cookie.
    maxAge: 86400,
  })
);

// Register all StorageProvider implementations once per request.
app.use("*", async (c, next) => {
  registerStorageProviders(c.env);
  await next();
});

// Health endpoint dihapus — tidak dibutuhkan dan bisa dipakai untuk fingerprinting
// infrastruktur (service name, dll). Jika uptime monitoring dibutuhkan,
// gunakan Cloudflare Health Checks di dashboard CF langsung.

app.route("/api/auth", authRoutes);
// /api/storage menggabungkan:
//   - /api/storage/accounts    (sebelumnya /api/drive-accounts)
//   - /api/storage/accounts/connect  (sebelumnya /api/google/connect-token)
//   - /api/storage/accounts/validate (sebelumnya /api/google/validate-token)
//   - /api/storage/summary     (sebelumnya /api/storage-manager/summary)
app.route("/api/storage", storageAccountRoutes);
app.route("/api/folders", folderRoutes);
app.route("/api/files", fileRoutes);
// POST /api/files/upload (sebelumnya POST /api/upload)
app.route("/api/files", uploadRoutes);
app.route("/api/logs", logRoutes);
app.route("/api/api-keys", apiKeyRoutes);

// Public download routes — mounted WITHOUT /api prefix on purpose.
// Mounted LAST so it never shadows /api/* routes.
app.route("/", downloadRoutes);

export default {
  fetch: app.fetch,

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    registerStorageProviders(env);
    ctx.waitUntil(syncDriveAccounts(env));
  },
};
