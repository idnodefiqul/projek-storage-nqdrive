-- Migration: 0004_files.sql
-- Tahap 2: Database Schema
--
-- files -> metadata terpusat untuk setiap file di virtual storage pool.
-- Binary content sesungguhnya berada di provider (drive_account_id menunjuk ke mana).
--
-- FK rationale:
--   drive_account_id -> RESTRICT : akun tidak boleh dihapus selama masih ada file
--                                  yang nempel di situ (mencegah orphan data fisik).
--   folder_id        -> SET NULL: folder dihapus, file pindah ke root (tidak ikut terhapus).
--
-- slug -> unik, dipakai sebagai URL publik (/slug.ext atau /download/slug.ext).

CREATE TABLE files (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  filename          TEXT NOT NULL,
  slug              TEXT NOT NULL UNIQUE,
  provider_file_id  TEXT NOT NULL,
  drive_account_id  INTEGER NOT NULL,
  folder_id         INTEGER,
  size_bytes        INTEGER NOT NULL DEFAULT 0,
  mime_type         TEXT NOT NULL DEFAULT 'application/octet-stream',
  visibility        TEXT NOT NULL DEFAULT 'private'
                      CHECK (visibility IN ('public', 'private', 'hidden')),
  download_count    INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at        TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY (drive_account_id) REFERENCES drive_accounts (id) ON DELETE RESTRICT,
  FOREIGN KEY (folder_id) REFERENCES folders (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX idx_files_slug ON files (slug);
CREATE INDEX idx_files_folder_id ON files (folder_id);
CREATE INDEX idx_files_drive_account_id ON files (drive_account_id);
CREATE INDEX idx_files_visibility ON files (visibility);
