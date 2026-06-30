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

# ── Security headers untuk semua path ──────────────────────
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src ${connectOrigins}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload

# ── index.html: JANGAN DI-CACHE — selalu ambil versi terbaru ──
# Ini mencegah error "failed to fetch dynamically imported module"
# setelah deploy baru (JS hash berubah tapi HTML lama masih di cache)
/index.html
  Cache-Control: no-cache, no-store, must-revalidate
  Pragma: no-cache

# ── Hashed JS/CSS assets: cache permanen (safe, nama berisi hash) ──
/assets/*
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
