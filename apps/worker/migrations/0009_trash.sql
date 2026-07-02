-- Migration: 0009_trash.sql
-- Fitur Trash (Recycle Bin) — Soft Delete untuk files dan folders.
--
-- Strategi:
--   deleted_at IS NULL     → item aktif (ditampilkan di Files page)
--   deleted_at IS NOT NULL → item di Trash (disembunyikan dari Files, muncul di Trash page)
--
-- original_folder_id / original_parent_folder_id:
--   Menyimpan folder asal sebelum di-trash agar bisa di-restore ke lokasi yang tepat.
--
-- Auto-purge: Cron job akan menghapus permanen semua item
--   dengan deleted_at < datetime('now', '-30 days').

-- ── files ─────────────────────────────────────────────────────────────────────
ALTER TABLE files ADD COLUMN deleted_at TEXT;
ALTER TABLE files ADD COLUMN original_folder_id INTEGER;

-- ── folders ───────────────────────────────────────────────────────────────────
ALTER TABLE folders ADD COLUMN deleted_at TEXT;
ALTER TABLE folders ADD COLUMN original_parent_folder_id INTEGER;

-- ── Indexes untuk performa query Trash ────────────────────────────────────────
CREATE INDEX idx_files_deleted_at ON files (deleted_at);
CREATE INDEX idx_folders_deleted_at ON folders (deleted_at);
