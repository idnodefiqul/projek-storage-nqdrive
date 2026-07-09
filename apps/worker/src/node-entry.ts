/**
 * Entry point standalone Node/VPS — TAMBAHAN dari deployment Cloudflare.
 *
 * Mengimpor default export { fetch, scheduled } dari ./index (yang TIDAK diubah
 * sama sekali) lalu menjalankannya di atas @hono/node-server dengan:
 *   - DB      : file SQLite lokal via better-sqlite3 (node-db-adapter)
 *   - env     : dibaca dari process.env (lihat .env.example), di-inject per-request
 *   - cron    : node-cron dengan jadwal SAMA PERSIS dengan wrangler.jsonc
 *   - ctx     : nodeExecutionContext (waitUntil fire-and-forget)
 *
 * Jalankan: pnpm --filter @nqdrive/worker start:node
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import Database from "better-sqlite3";
import cron from "node-cron";

import handler from "./index";
import { NodeD1Database } from "./adapters/node-db-adapter";
import { nodeExecutionContext } from "./adapters/node-execution-context";
import type { Env } from "./config/env";

// ── Muat .env (kalau ada) tanpa dependency dotenv (Node >= 20.12) ──────────
const envFile = path.resolve(process.cwd(), ".env");
if (existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
  } catch (err) {
    console.warn(`[node-entry] Gagal memuat ${envFile}:`, err);
  }
}

// ── Validasi konfigurasi minimum sebelum menerima traffic ──────────────────
const missing = ["JWT_SECRET", "ENCRYPTION_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]
  .filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(
    `[node-entry] Env berikut wajib diisi (lihat .env.example): ${missing.join(", ")}`
  );
  process.exit(1);
}

// ── Buka database SQLite ────────────────────────────────────────────────────
const dbPath = process.env.DB_PATH ?? "./nqdrive.db";
if (!existsSync(dbPath)) {
  console.error(
    `[node-entry] File database tidak ditemukan: ${dbPath}\n` +
      `Buat dulu dengan: sqlite3 ${dbPath} < dbcloud.sql`
  );
  process.exit(1);
}
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
const adapter = new NodeD1Database(sqlite);
console.log(`[node-entry] SQLite terbuka: ${dbPath}`);

// ── Env per-request (bentuk sama persis dengan interface Env Cloudflare) ────
function buildEnv(): Env {
  return {
    DB: adapter as unknown as Env["DB"],
    APP_ENV: (process.env.APP_ENV as Env["APP_ENV"]) ?? "production",
    GOOGLE_OAUTH_REDIRECT_URI: process.env.GOOGLE_OAUTH_REDIRECT_URI ?? "",
    WEB_APP_URL: process.env.WEB_APP_URL ?? "",
    JWT_SECRET: process.env.JWT_SECRET ?? "",
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "",
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "",
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? "",
  };
}

// ── Cron: jadwal SAMA PERSIS dengan wrangler.jsonc ("*/10 * * * *") ─────────
cron.schedule("*/10 * * * *", () => {
  console.log("[cron] scheduled tick");
  handler
    .scheduled({} as never, buildEnv(), nodeExecutionContext as never)
    .catch((err: unknown) => console.error("[cron]", err));
});

// ── HTTP server ─────────────────────────────────────────────────────────────
const port = Number(process.env.PORT) || 8787;
serve({
  fetch: (request) =>
    handler.fetch(request as never, buildEnv(), nodeExecutionContext as never),
  port,
});
console.log(`[node-entry] NQDRIVE worker (Node standalone) listening on http://0.0.0.0:${port}`);
