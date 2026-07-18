/**
 * Backfill public_id for existing rows that have NULL public_id.
 * Generates professional prefixed IDs: sadm_, usr_, acc_, fld_, fil_, tsk_, api_, etc.
 * Usage:
 *   node scripts/backfill-public-ids.mjs --local
 *   node scripts/backfill-public-ids.mjs --remote
 *
 * This script is idempotent and safe to run multiple times.
 */

import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(__dirname, "..");
const DB_NAME = "nqdrive-db";

const args = process.argv.slice(2);
const isRemote = args.includes("--remote");
const isLocal = args.includes("--local");

if (isRemote === isLocal) {
  console.error("Pilih SATU target: --local atau --remote.");
  process.exit(1);
}
const targetFlag = isRemote ? "--remote" : "--local";

const isWin = process.platform === "win32";
const localBin = resolve(workerRoot, "node_modules", ".bin", isWin ? "wrangler.CMD" : "wrangler");
const wranglerBin = existsSync(localBin) ? localBin : "wrangler";

function shellEscape(arg) {
  if (isWin) return `"${arg.replace(/"/g, '""')}"`;
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

function runWrangler(wranglerArgs, options = {}) {
  const cmd = [shellEscape(wranglerBin), ...wranglerArgs.map(shellEscape)].join(" ");
  return execSync(cmd, {
    cwd: workerRoot,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    shell: true,
  });
}

function runQuery(sql) {
  try {
    const out = runWrangler(["d1", "execute", DB_NAME, targetFlag, "--command", sql, "--json"]);
    // wrangler --json output: array of result objects, each has results array
    // For SELECT, we want to parse results
    try {
      const parsed = JSON.parse(out);
      // parsed is array of execution results
      // Example: [{ results: [{id:1}, ...], ... }]
      if (Array.isArray(parsed) && parsed[0] && Array.isArray(parsed[0].results)) {
        return parsed[0].results;
      }
      return [];
    } catch {
      // Fallback if not JSON (maybe no rows)
      return [];
    }
  } catch (e) {
    console.error(`Query failed: ${sql}`);
    console.error(e.stdout ?? e.message);
    return [];
  }
}

function randomAlphanumeric(len) {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let res = "";
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && cryptoObj.getRandomValues) {
    const bytes = new Uint8Array(len);
    cryptoObj.getRandomValues(bytes);
    for (let i = 0; i < len; i++) res += chars[bytes[i] % chars.length];
  } else {
    for (let i = 0; i < len; i++) res += chars[Math.floor(Math.random() * chars.length)];
  }
  return res;
}

function generatePublicId(prefix, len = 26) {
  return `${prefix}_${randomAlphanumeric(len)}`;
}

// Mapping table -> prefix + id column
const TABLES = [
  { table: "users", prefix: "sadm", label: "Super Admin (users)" }, // sadm_ untuk admin existing
  { table: "drive_accounts", prefix: "acc", label: "Storage Account" },
  { table: "folders", prefix: "fld", label: "Folder" },
  { table: "files", prefix: "fil", label: "File" },
  { table: "api_keys", prefix: "api", label: "API Key" },
  { table: "migration_jobs", prefix: "tsk", label: "Migration Job" },
  { table: "migration_items", prefix: "mit", label: "Migration Item" },
  { table: "upload_logs", prefix: "upl", label: "Upload Log" },
  { table: "download_logs", prefix: "dnl", label: "Download Log" },
  { table: "audit_logs", prefix: "aud", label: "Audit Log" },
];

console.log(`[backfill] Target: ${targetFlag} DB: ${DB_NAME}`);

let totalUpdated = 0;

for (const { table, prefix, label } of TABLES) {
  console.log(`\n[backfill] Checking ${table} (${label}) for NULL public_id...`);
  const rows = runQuery(`SELECT id FROM ${table} WHERE public_id IS NULL OR public_id = ''`);
  if (!rows || rows.length === 0) {
    console.log(`[backfill] ${table}: no rows need backfill (0).`);
    continue;
  }
  console.log(`[backfill] ${table}: found ${rows.length} rows to backfill.`);

  for (const row of rows) {
    const internalId = row.id;
    const publicId = generatePublicId(prefix);
    const sql = `UPDATE ${table} SET public_id = '${publicId}' WHERE id = ${internalId}`;
    try {
      runWrangler(["d1", "execute", DB_NAME, targetFlag, "--command", sql]);
      console.log(`  - ${table} id=${internalId} => ${publicId}`);
      totalUpdated++;
    } catch (e) {
      console.error(`  ! Failed to update ${table} id=${internalId}: ${e.message}`);
    }
  }
}

console.log(`\n[backfill] Done. Total rows updated: ${totalUpdated}`);

// After backfill, verify no NULLs left
console.log("\n[backfill] Verifying remaining NULLs...");
for (const { table } of TABLES) {
  const remaining = runQuery(`SELECT COUNT(*) as cnt FROM ${table} WHERE public_id IS NULL OR public_id = ''`);
  const cnt = remaining[0]?.cnt ?? 0;
  console.log(`  ${table}: ${cnt} remaining NULL`);
}

console.log("\n[backfill] All done. Next: run dbcloud.sql to ensure UNIQUE indexes are created (already handled by migrate-d1.mjs).");
