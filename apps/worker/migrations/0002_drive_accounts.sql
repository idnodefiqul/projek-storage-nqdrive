-- Migration: 0002_drive_accounts.sql
-- Tahap 2: Database Schema
--
-- drive_accounts -> akun storage yang terhubung (multi-provider, dimulai dari Google Drive).
-- refresh_token disimpan terenkripsi (AES-GCM, dienkripsi/didekripsi di worker layer,
-- bukan di level SQL) -- kolom ini hanya menyimpan ciphertext + IV sebagai TEXT (base64).

CREATE TABLE drive_accounts (
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

CREATE INDEX idx_drive_accounts_status ON drive_accounts (status);
