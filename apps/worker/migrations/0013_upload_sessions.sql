-- Migration: 0013_upload_sessions.sql
-- Store active Google Drive resumable upload sessions persistently.
-- Cloudflare Workers isolates can die at any time, wiping out in-memory Maps.
-- Persisting sessions in D1 allows uploads to be resumed even hours later.

CREATE TABLE upload_sessions (
  id                  TEXT PRIMARY KEY,
  google_upload_url   TEXT NOT NULL,
  drive_account_id    INTEGER NOT NULL,
  filename            TEXT NOT NULL,
  mime_type           TEXT NOT NULL,
  size_bytes          INTEGER NOT NULL,
  created_at          TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY (drive_account_id) REFERENCES drive_accounts (id) ON DELETE CASCADE
);

CREATE INDEX idx_upload_sessions_created_at ON upload_sessions (created_at);