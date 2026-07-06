-- dbcloud.sql — Skema database NQDRIVE lengkap & idempoten (konsolidasi migration 0001–0014).
-- Aman dijalankan berulang: tabel yang sudah ada TIDAK disentuh (data aman),
-- hanya tabel baru yang ditambahkan. TIDAK ada DROP/DELETE.
-- Catatan: menambah KOLOM ke tabel lama tetap butuh ALTER TABLE terpisah
--          (SQLite/D1 tidak mendukung ADD COLUMN IF NOT EXISTS).
-- Jalankan: pnpm db:migrate:remote
--   (setara: wrangler d1 execute nqdrive-db --remote --file=./dbcloud.sql)

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at    TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  email         TEXT NOT NULL DEFAULT '',
  totp_secret   TEXT,
  totp_enabled  INTEGER NOT NULL DEFAULT 0,
  backup_codes  TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
INSERT OR IGNORE INTO settings (key, value) VALUES ('setup_completed', 'false');
INSERT OR IGNORE INTO settings (key, value) VALUES ('site_name', 'NQDRIVE');
INSERT OR IGNORE INTO settings (key, value) VALUES ('download_endpoint', 'default');

CREATE TABLE IF NOT EXISTS drive_accounts (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  email                    TEXT NOT NULL UNIQUE,
  provider                 TEXT NOT NULL DEFAULT 'google_drive'
                             CHECK (provider IN (
                               'google_drive', 'cloudflare_r2', 'amazon_s3',
                               'backblaze_b2', 'wasabi', 'dropbox', 'onedrive', 'minio'
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
CREATE INDEX IF NOT EXISTS idx_drive_accounts_status ON drive_accounts (status);

CREATE TABLE IF NOT EXISTS folders (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  name                      TEXT NOT NULL,
  parent_folder_id          INTEGER,
  created_at                TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at                TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  deleted_at                TEXT,
  original_parent_folder_id INTEGER,
  FOREIGN KEY (parent_folder_id) REFERENCES folders (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_folders_parent_folder_id ON folders (parent_folder_id);
CREATE INDEX IF NOT EXISTS idx_folders_deleted_at ON folders (deleted_at);

CREATE TABLE IF NOT EXISTS files (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  filename           TEXT NOT NULL,
  slug               TEXT NOT NULL UNIQUE,
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
  download_password  TEXT DEFAULT NULL,
  FOREIGN KEY (drive_account_id) REFERENCES drive_accounts (id) ON DELETE RESTRICT,
  FOREIGN KEY (folder_id) REFERENCES folders (id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_files_slug ON files (slug);
CREATE INDEX IF NOT EXISTS idx_files_folder_id ON files (folder_id);
CREATE INDEX IF NOT EXISTS idx_files_drive_account_id ON files (drive_account_id);
CREATE INDEX IF NOT EXISTS idx_files_visibility ON files (visibility);
CREATE INDEX IF NOT EXISTS idx_files_deleted_at ON files (deleted_at);

CREATE TABLE IF NOT EXISTS upload_logs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id          INTEGER,
  filename         TEXT NOT NULL,
  size_bytes       INTEGER NOT NULL DEFAULT 0,
  drive_account_id INTEGER NOT NULL,
  duration_ms      INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL CHECK (status IN ('success', 'failed', 'cancelled')),
  error_message    TEXT,
  created_at       TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE SET NULL,
  FOREIGN KEY (drive_account_id) REFERENCES drive_accounts (id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS download_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id      INTEGER,
  ip_address   TEXT NOT NULL,
  user_agent   TEXT,
  bytes_served INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL CHECK (status IN ('completed', 'partial', 'failed')),
  created_at   TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  country      TEXT,
  FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_upload_logs_drive_account_id ON upload_logs (drive_account_id);
CREATE INDEX IF NOT EXISTS idx_upload_logs_created_at ON upload_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_download_logs_file_id ON download_logs (file_id);
CREATE INDEX IF NOT EXISTS idx_download_logs_created_at ON download_logs (created_at);

CREATE TABLE IF NOT EXISTS api_keys (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  key_prefix   TEXT NOT NULL,
  last_used_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  revoked_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_api_keys_revoked_at ON api_keys (revoked_at);

CREATE TABLE IF NOT EXISTS upload_sessions (
  id                TEXT PRIMARY KEY,
  google_upload_url TEXT NOT NULL,
  drive_account_id  INTEGER NOT NULL,
  filename          TEXT NOT NULL,
  mime_type         TEXT NOT NULL,
  size_bytes        INTEGER NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY (drive_account_id) REFERENCES drive_accounts (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_created_at ON upload_sessions (created_at);

-- ─── Migrasi isi Google Drive antar akun ────────────────────────────────────
-- State migrasi disimpan di D1 (bukan di browser) sehingga proses bisa
-- dilanjutkan oleh loop frontend maupun cron backstop kapan saja.
CREATE TABLE IF NOT EXISTS migration_jobs (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  source_account_id  INTEGER NOT NULL,
  target_account_id  INTEGER NOT NULL,
  status             TEXT NOT NULL DEFAULT 'running'
                       CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  total_files        INTEGER NOT NULL DEFAULT 0,
  migrated_files     INTEGER NOT NULL DEFAULT 0,
  failed_files       INTEGER NOT NULL DEFAULT 0,
  total_bytes        INTEGER NOT NULL DEFAULT 0,
  migrated_bytes     INTEGER NOT NULL DEFAULT 0,
  error              TEXT,
  created_at         TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at         TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  finished_at        TEXT,
  FOREIGN KEY (source_account_id) REFERENCES drive_accounts (id) ON DELETE CASCADE,
  FOREIGN KEY (target_account_id) REFERENCES drive_accounts (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_migration_jobs_status ON migration_jobs (status);

-- Item per file: diisi lengkap saat job dibuat agar progress akurat dan
-- file yang gagal bisa di-skip tanpa mengulang dari awal.
-- file_id NULL = file di Google Drive asli yang tidak tercatat di dashboard
-- (ikut dimigrasikan via provider_file_id + filename).
-- original_visibility menyimpan visibility sebelum migrasi: file public
-- di-set private selama proses, lalu dikembalikan setelah pindah/selesai.
CREATE TABLE IF NOT EXISTS migration_items (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id               INTEGER NOT NULL,
  file_id              INTEGER,
  provider_file_id     TEXT NOT NULL DEFAULT '',
  filename             TEXT NOT NULL DEFAULT '',
  size_bytes           INTEGER NOT NULL DEFAULT 0,
  original_visibility  TEXT,
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  error                TEXT,
  updated_at           TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY (job_id) REFERENCES migration_jobs (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_migration_items_job_status ON migration_items (job_id, status);

CREATE TABLE IF NOT EXISTS login_attempts (
  ip TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS download_attempts (
  ip TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  action     TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'warning', 'error', 'info')),
  user       TEXT NOT NULL DEFAULT 'admin',
  ip         TEXT NOT NULL DEFAULT '',
  country    TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs (status);
