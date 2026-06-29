-- Migration: 0005_logs.sql
-- Tahap 2: Database Schema
--
-- upload_logs / download_logs -> audit trail. file_id pakai ON DELETE SET NULL
-- karena log harus tetap ada untuk audit/analytics walaupun file aslinya
-- sudah dihapus (riwayat tidak boleh hilang begitu saja).

CREATE TABLE upload_logs (
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

CREATE TABLE download_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id      INTEGER,
  ip_address   TEXT NOT NULL,
  user_agent   TEXT,
  bytes_served INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL CHECK (status IN ('completed', 'partial', 'failed')),
  created_at   TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE SET NULL
);

CREATE INDEX idx_upload_logs_drive_account_id ON upload_logs (drive_account_id);
CREATE INDEX idx_upload_logs_created_at ON upload_logs (created_at);
CREATE INDEX idx_download_logs_file_id ON download_logs (file_id);
CREATE INDEX idx_download_logs_created_at ON download_logs (created_at);
