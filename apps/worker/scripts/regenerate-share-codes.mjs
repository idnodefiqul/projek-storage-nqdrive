/**
 * One-time script: regenerate share_code untuk SEMUA file yang ada di D1
 * ke format baru (huruf besar-kecil campur, lebih banyak huruf daripada angka).
 *
 * Kenapa perlu: file lama diberi share_code oleh migration 0011 memakai
 *   substr(hex(randomblob(12)), 1, 23)
 * yang menghasilkan HEX huruf besar semua (0-9A-F), contoh:
 *   7773ADC168A559D3CA767FD
 * Script ini menggantinya dengan generator yang sama seperti upload.service.ts.
 *
 * ⚠️  PERINGATAN: semua link download yang SUDAH pernah dibagikan untuk file
 *     lama akan berubah (link lama jadi 404). Jalankan hanya jika Anda memang
 *     ingin merotasi semua kode.
 *
 * Cara pakai (dari folder apps/worker):
 *   # 1. Uji dulu ke DB lokal:
 *   node scripts/regenerate-share-codes.mjs --local
 *   # 2. Jika sudah yakin, jalankan ke DB production (remote):
 *   node scripts/regenerate-share-codes.mjs --remote
 *
 * Butuh wrangler sudah login (wrangler login) dan berada di folder apps/worker.
 */

import { execSync } from "node:child_process";
import { webcrypto as crypto } from "node:crypto";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DB_NAME = "nqdrive-db";

// ── Argumen ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const isRemote = args.includes("--remote");
const isLocal = args.includes("--local");
if (isRemote === isLocal) {
  console.error("Pilih SATU target: --local (uji) atau --remote (production).");
  process.exit(1);
}
const targetFlag = isRemote ? "--remote" : "--local";

// ── Generator kode share (identik dengan upload.service.ts) ─────────────────
// Huruf diberi bobot 2x lebih besar dari angka → kode jelas lebih banyak huruf
// daripada angka, tapi tetap mengandung beberapa angka (~2 dari 23), campur
// huruf besar-kecil.
const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const digits = "0123456789";
const charset = letters + letters + digits;

function generateShareCode() {
  let code = "";
  const randomValues = new Uint32Array(23);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < 23; i++) {
    code += charset[randomValues[i] % charset.length];
  }
  return code;
}

// ── Helper untuk memanggil wrangler d1 execute ──────────────────────────────
// Node 24 di Windows menolak spawn .cmd tanpa shell, jadi kita rakit satu
// string perintah dan jalankan lewat shell. Argumen yang mengandung spasi
// (mis. SQL --command) dibungkus tanda kutip ganda; SQL kita hanya memakai
// tanda kutip tunggal di dalam, jadi aman.
function q(arg) {
  return /[^A-Za-z0-9_./:@-]/.test(arg) ? `"${arg}"` : arg;
}
function runD1(cmdArgs) {
  const full = ["npx", "wrangler", "d1", "execute", DB_NAME, targetFlag, ...cmdArgs]
    .map(q)
    .join(" ");
  return execSync(full, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

// ── Main ────────────────────────────────────────────────────────────────────
console.log(`\n▶ Target DB: ${DB_NAME} (${targetFlag})\n`);

console.log("Mengambil daftar file…");
const raw = runD1(["--command", "SELECT id FROM files;", "--json"]);

// wrangler --json mengembalikan array [{ results: [...] }]
let ids = [];
try {
  const parsed = JSON.parse(raw);
  const results = Array.isArray(parsed) ? parsed[0]?.results : parsed?.results;
  ids = (results ?? []).map((r) => r.id);
} catch (e) {
  console.error("Gagal parse output wrangler:", e);
  console.error("Output mentah:\n", raw);
  process.exit(1);
}

if (ids.length === 0) {
  console.log("Tidak ada file di DB. Selesai.");
  process.exit(0);
}

console.log(`Ditemukan ${ids.length} file. Membuat kode baru…\n`);

// Escape aman: id adalah integer dari DB, kode hanya [A-Za-z0-9] → aman untuk SQL.
const seen = new Set();
const statements = ids.map((id) => {
  let code = generateShareCode();
  while (seen.has(code)) code = generateShareCode(); // hindari duplikat dalam batch
  seen.add(code);
  return `UPDATE files SET share_code = '${code}' WHERE id = ${Number(id)};`;
});

// Tulis ke file .sql sementara lalu jalankan via --file. Lebih andal daripada
// mengirim ratusan statement lewat --command (batas panjang argumen di Windows).
const sqlPath = join(tmpdir(), `nqdrive-regen-${ids.length}.sql`);
writeFileSync(sqlPath, statements.join("\n"), "utf8");

console.log(`Menjalankan ${statements.length} UPDATE…`);
try {
  runD1(["--file", sqlPath]);
} finally {
  try { unlinkSync(sqlPath); } catch { /* abaikan */ }
}

console.log(`\n✅ Selesai. ${statements.length} share_code diregenerasi ke format baru.`);
console.log("   Link download lama untuk file-file ini sekarang sudah tidak berlaku.\n");
