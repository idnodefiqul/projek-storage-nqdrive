/**
 * Idempotent D1 migrate wrapper.
 * D1/SQLite does not support ADD COLUMN IF NOT EXISTS, so this script runs
 * known legacy ALTER statements first and ignores safe "already exists" errors.
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

// Resolve wrangler binary from local node_modules
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

function runOptionalAlter(sql) {
  try {
    console.log(`[migrate] ALTER: ${sql}`);
    runWrangler(["d1", "execute", DB_NAME, targetFlag, "--command", sql]);
    console.log("[migrate] ALTER OK (kolom ditambahkan).");
  } catch (error) {
    const output = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
    const safeToIgnore =
      output.includes("duplicate column name") ||
      output.includes("no such table");

    if (safeToIgnore) {
      console.log("[migrate] ALTER skipped (kolom sudah ada atau tabel belum ada).");
    } else {
      throw error;
    }
  }
}

// Step 1: ensure share_uuid column exists on folders table
runOptionalAlter("ALTER TABLE folders ADD COLUMN share_uuid TEXT DEFAULT NULL;");

// Step 1b: ensure md5_hash column exists on files table (added together with hash-wasm integration)
runOptionalAlter("ALTER TABLE files ADD COLUMN md5_hash TEXT DEFAULT NULL;");

// Step 1c: ensure sha256_hash & md5_hash columns exist on upload_logs table
runOptionalAlter("ALTER TABLE upload_logs ADD COLUMN sha256_hash TEXT DEFAULT NULL;");
runOptionalAlter("ALTER TABLE upload_logs ADD COLUMN md5_hash TEXT DEFAULT NULL;");

// Step 1d: Update drive_accounts CHECK constraint to support 'telegram'
console.log("[migrate] Updating drive_accounts check constraints...");
try {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const tempSqlFile = path.resolve(workerRoot, "temp-migrate-tg.sql");
  
  const sqlCommands = `
    PRAGMA foreign_keys = OFF;
    CREATE TABLE IF NOT EXISTS drive_accounts_new (
      id                       INTEGER PRIMARY KEY AUTOINCREMENT,
      email                    TEXT NOT NULL UNIQUE,
      provider                 TEXT NOT NULL DEFAULT 'google_drive'
                                 CHECK (provider IN (
                                   'google_drive', 'cloudflare_r2', 'amazon_s3',
                                   'backblaze_b2', 'wasabi', 'dropbox', 'onedrive', 'minio', 'telegram'
                                 )),
      refresh_token_encrypted  TEXT NOT NULL,
      access_token             TEXT,
      access_token_expires_at  TEXT,
      total_storage_bytes      INTEGER NOT NULL DEFAULT 0,
      used_storage_bytes       INTEGER NOT NULL DEFAULT 0,
      available_storage_bytes  INTEGER NOT NULL DEFAULT 0,
      status                   TEXT NOT NULL DEFAULT 'offline'
                                 CHECK (status IN ('online', 'offline', 'error', 'syncing')),
      last_synced_at           TEXT,
      created_at               TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      updated_at               TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
    INSERT OR IGNORE INTO drive_accounts_new SELECT * FROM drive_accounts;
    DROP TABLE IF EXISTS drive_accounts;
    ALTER TABLE drive_accounts_new RENAME TO drive_accounts;
    CREATE INDEX IF NOT EXISTS idx_drive_accounts_status ON drive_accounts (status);
    PRAGMA foreign_keys = ON;
  `;
  
  fs.writeFileSync(tempSqlFile, sqlCommands, "utf8");
  runWrangler(["d1", "execute", DB_NAME, targetFlag, `--file=${tempSqlFile}`]);
  fs.unlinkSync(tempSqlFile);
  console.log("[migrate] drive_accounts CHECK constraint updated successfully.");
} catch (err) {
  console.error("Gagal mengupdate constraint tabel drive_accounts (abaikan jika sudah terupdate):", err);
}

// Step 2: run full idempotent schema
console.log("[migrate] Running dbcloud.sql ...");
runWrangler(["d1", "execute", DB_NAME, targetFlag, "--file=./dbcloud.sql"], {
  stdio: "inherit",
});
console.log("[migrate] Done.");
