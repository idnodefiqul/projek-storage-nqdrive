/**
 * generate-headers.mjs
 *
 * Dibaca sebelum vite build — generate file public/_headers
 * berdasarkan variabel di .env.production.
 *
 * Jalankan otomatis via: "prebuild" script di package.json
 * Tidak perlu install library tambahan — pakai Node.js built-in saja.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

// ── Baca .env.production ──────────────────────────────────────────────────
function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const content = readFileSync(filePath, "utf-8");
  const vars = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    vars[key] = val;
  }
  return vars;
}

const env = parseEnvFile(resolve(rootDir, ".env.production"));

// ── Ambil nilai dengan fallback ───────────────────────────────────────────
const workerUrl    = env.VITE_WORKER_URL          ?? "";
const appUrl       = env.VITE_APP_URL             ?? "";
const extraOrigins = env.VITE_ALLOWED_API_ORIGINS ?? "";

// Bangun daftar connect-src — tanpa *.workers.dev (terlalu lebar, bisa ke subdomain siapapun)
const connectOrigins = [
  "'self'",
  workerUrl,
  appUrl,
  ...extraOrigins.split(",").map((s) => s.trim()),
]
  .filter(Boolean)
  .filter((v, i, arr) => arr.indexOf(v) === i)
  .join(" ");

// ── Generate isi _headers ─────────────────────────────────────────────────
const headersContent = `# ============================================================
#  _headers — Cloudflare Pages
#  AUTO-GENERATED oleh scripts/generate-headers.mjs
#  JANGAN edit manual — edit .env.production lalu build ulang
# ============================================================

# ── Security & Caching headers untuk semua path ──────────────────────
# Default: JANGAN DI-CACHE untuk index.html pada route SPA (/, /dashboard, dll)
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; script-src 'self' https://static.cloudflareinsights.com https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: ${connectOrigins}; media-src 'self' ${connectOrigins}; frame-src 'self' ${connectOrigins}; connect-src ${connectOrigins}; worker-src 'self' blob: https://cdnjs.cloudflare.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  Cache-Control: no-cache, no-store, must-revalidate
  CDN-Cache-Control: no-store
  Pragma: no-cache

# ── Hashed JS/CSS assets: cache permanen (safe, nama berisi hash) ──
/assets/*
  Cache-Control: public, max-age=31536000, immutable

# ── Static images di /public/ — cache 30 hari + revalidate ──────────
# File PNG/SVG/ICO/WEBP/JPG tidak punya hash di nama, jadi pakai
# stale-while-revalidate agar browser bisa pakai cache lama sambil
# fetch versi baru di background. Ini menghilangkan delay logo.
/*.png
  Cache-Control: public, max-age=2592000, stale-while-revalidate=86400
/*.svg
  Cache-Control: public, max-age=2592000, stale-while-revalidate=86400
/*.ico
  Cache-Control: public, max-age=2592000, stale-while-revalidate=86400
/*.webp
  Cache-Control: public, max-age=2592000, stale-while-revalidate=86400
/*.jpg
  Cache-Control: public, max-age=2592000, stale-while-revalidate=86400
/*.jpeg
  Cache-Control: public, max-age=2592000, stale-while-revalidate=86400

# ── Fonts (woff2/woff) — cache 1 tahun ─────────────────────────────
/*.woff2
  Cache-Control: public, max-age=31536000, immutable
/*.woff
  Cache-Control: public, max-age=31536000, immutable

# Google Fonts
https://fonts.googleapis.com/*
  Access-Control-Allow-Origin: *

https://fonts.gstatic.com/*
  Access-Control-Allow-Origin: *
`;

// ── Tulis ke public/_headers ──────────────────────────────────────────────
const outputPath = resolve(rootDir, "public/_headers");
writeFileSync(outputPath, headersContent, "utf-8");

console.log("✅ _headers generated from .env.production");
console.log("   connect-src:", connectOrigins);
console.log("   Output:", outputPath);
