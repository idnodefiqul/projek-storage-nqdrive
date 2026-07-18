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

// Step 1e: ensure provider column exists on upload_sessions (endpoint upload multi-provider).
runOptionalAlter("ALTER TABLE upload_sessions ADD COLUMN provider TEXT NOT NULL DEFAULT 'google_drive';");

// Step 1f: ensure public_id columns exist (professional ID refactor)
runOptionalAlter("ALTER TABLE users ADD COLUMN public_id TEXT;");
runOptionalAlter("ALTER TABLE drive_accounts ADD COLUMN public_id TEXT;");
runOptionalAlter("ALTER TABLE folders ADD COLUMN public_id TEXT;");
runOptionalAlter("ALTER TABLE files ADD COLUMN public_id TEXT;");
runOptionalAlter("ALTER TABLE upload_logs ADD COLUMN public_id TEXT;");
runOptionalAlter("ALTER TABLE download_logs ADD COLUMN public_id TEXT;");
runOptionalAlter("ALTER TABLE api_keys ADD COLUMN public_id TEXT;");
runOptionalAlter("ALTER TABLE migration_jobs ADD COLUMN public_id TEXT;");
runOptionalAlter("ALTER TABLE migration_items ADD COLUMN public_id TEXT;");
runOptionalAlter("ALTER TABLE audit_logs ADD COLUMN public_id TEXT;");

// Step 1g: fix slug unique index to be partial (active files only) so file in trash doesn't block upload with same name
console.log("[migrate] Fixing files slug unique index to be partial (active only)...");
try {
  runWrangler(["d1", "execute", DB_NAME, targetFlag, "--command", "DROP INDEX IF EXISTS idx_files_slug;"]);
  console.log("[migrate] Dropped old idx_files_slug");
} catch (e) {
  console.log("[migrate] Drop old idx_files_slug skipped (may not exist):", e.message?.slice(0,200));
}
try {
  runWrangler(["d1", "execute", DB_NAME, targetFlag, "--command", "CREATE UNIQUE INDEX IF NOT EXISTS idx_files_slug_active ON files (slug) WHERE deleted_at IS NULL;"]);
  console.log("[migrate] Created partial index idx_files_slug_active");
} catch (e) {
  console.log("[migrate] Create partial index skipped:", e.message?.slice(0,200));
}

// Step 1h: Rebuild files table — remove UNIQUE from slug column (keep only partial unique index for active files)
// This allows uploading same filename even if file with same slug exists in trash
console.log("[migrate] Rebuilding files table (remove UNIQUE from slug, keep partial index)...");
try {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const tempSqlFileFiles = path.resolve(workerRoot, "temp-migrate-files.sql");
  const sqlCommandsFiles = `
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS files_new;
    CREATE TABLE files_new (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id          TEXT,
      filename           TEXT NOT NULL,
      slug               TEXT NOT NULL,
      provider_file_id   TEXT NOT NULL,
      drive_account_id   INTEGER NOT NULL,
      folder_id          INTEGER,
      size_bytes         INTEGER NOT NULL DEFAULT 0,
      mime_type          TEXT NOT NULL DEFAULT 'application/octet-stream',
      visibility         TEXT NOT NULL DEFAULT 'private'
                           CHECK (visibility IN ('public', 'private', 'hidden')),
      download_count     INTEGER NOT NULL DEFAULT 0,
      created_at         TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      updated_at         TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      deleted_at         TEXT,
      original_folder_id INTEGER,
      share_code         TEXT NOT NULL DEFAULT '',
      sha256_hash        TEXT DEFAULT NULL,
      md5_hash           TEXT DEFAULT NULL,
      download_password  TEXT DEFAULT NULL,
      FOREIGN KEY (drive_account_id) REFERENCES drive_accounts (id) ON DELETE RESTRICT,
      FOREIGN KEY (folder_id) REFERENCES folders (id) ON DELETE SET NULL
    );
    INSERT OR IGNORE INTO files_new
      (id, public_id, filename, slug, provider_file_id, drive_account_id, folder_id, size_bytes, mime_type, visibility, download_count, created_at, updated_at, deleted_at, original_folder_id, share_code, sha256_hash, md5_hash, download_password)
    SELECT
      id, public_id, filename, slug, provider_file_id, drive_account_id, folder_id, size_bytes, mime_type, visibility, download_count, created_at, updated_at, deleted_at, original_folder_id, share_code, sha256_hash, md5_hash, download_password
    FROM files;
    DROP TABLE IF EXISTS files;
    ALTER TABLE files_new RENAME TO files;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_files_slug_active ON files (slug) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_files_folder_id ON files (folder_id);
    CREATE INDEX IF NOT EXISTS idx_files_drive_account_id ON files (drive_account_id);
    CREATE INDEX IF NOT EXISTS idx_files_visibility ON files (visibility);
    CREATE INDEX IF NOT EXISTS idx_files_deleted_at ON files (deleted_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_files_public_id ON files (public_id);
    PRAGMA foreign_keys = ON;
  `;
  fs.writeFileSync(tempSqlFileFiles, sqlCommandsFiles, "utf8");
  runWrangler(["d1", "execute", DB_NAME, targetFlag, `--file=${tempSqlFileFiles}`]);
  fs.unlinkSync(tempSqlFileFiles);
  console.log("[migrate] files table rebuilt without UNIQUE on slug, partial index created.");
} catch (err) {
  console.error("Gagal rebuild files table:", err);
}

// Step 1d: Rebuild drive_accounts — buang UNIQUE global pada `email` dan ganti
// dengan UNIQUE komposit (email, provider). Ini memperbaiki bug: satu email
// (mis. Gmail yang sama) dipakai di Google Drive DAN Dropbox harus jadi dua baris
// terpisah, bukan saling menimpa.
console.log("[migrate] Rebuilding drive_accounts (email unique per-provider)...");
try {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const tempSqlFile = path.resolve(workerRoot, "temp-migrate-accounts.sql");

  const sqlCommands = `
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS drive_accounts_new;
    CREATE TABLE drive_accounts_new (
      id                       INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id                TEXT,
      email                    TEXT NOT NULL,
       provider                 TEXT NOT NULL DEFAULT 'google_drive'
                                 CHECK (provider IN (
                                   'google_drive', 'cloudflare_r2', 'amazon_s3',
                                   'backblaze_b2', 'wasabi', 'dropbox', 'onedrive', 'koofr', 'minio', 'telegram'
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
    INSERT OR IGNORE INTO drive_accounts_new
      (id, public_id, email, provider, refresh_token_encrypted, access_token, access_token_expires_at,
       total_storage_bytes, used_storage_bytes, available_storage_bytes, status,
       last_synced_at, created_at, updated_at)
    SELECT
       id, public_id, email, provider, refresh_token_encrypted, access_token, access_token_expires_at,
       total_storage_bytes, used_storage_bytes, available_storage_bytes, status,
       last_synced_at, created_at, updated_at
    FROM drive_accounts;
    DROP TABLE IF EXISTS drive_accounts;
    ALTER TABLE drive_accounts_new RENAME TO drive_accounts;
    CREATE INDEX IF NOT EXISTS idx_drive_accounts_status ON drive_accounts (status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_drive_accounts_email_provider ON drive_accounts (email, provider);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_drive_accounts_public_id ON drive_accounts (public_id);
    PRAGMA foreign_keys = ON;
  `;

  fs.writeFileSync(tempSqlFile, sqlCommands, "utf8");
  runWrangler(["d1", "execute", DB_NAME, targetFlag, `--file=${tempSqlFile}`]);
  fs.unlinkSync(tempSqlFile);
  console.log("[migrate] drive_accounts rebuilt with (email, provider) unique index.");
} catch (err) {
  console.error("Gagal me-rebuild tabel drive_accounts (abaikan jika sudah terupdate):", err);
}

// Step 2: run full idempotent schema
console.log("[migrate] Running dbcloud.sql ...");
runWrangler(["d1", "execute", DB_NAME, targetFlag, "--file=./dbcloud.sql"], {
  stdio: "inherit",
});
console.log("[migrate] Done.");
