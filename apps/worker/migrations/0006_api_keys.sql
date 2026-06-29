-- Migration: 0006_api_keys.sql
-- Tahap 2: Database Schema
--
-- api_keys -> kredensial untuk akses programatik ke REST API NQDRIVE
-- (misal dari script eksternal). Key asli HANYA ditampilkan sekali saat dibuat;
-- yang disimpan permanen adalah hash-nya. key_prefix disimpan plaintext murni
-- untuk keperluan identifikasi visual di UI (misal "nqd_live_a1b2"), tidak
-- cukup panjang untuk dipakai autentikasi.

CREATE TABLE api_keys (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  key_hash    TEXT NOT NULL UNIQUE,
  key_prefix  TEXT NOT NULL,
  last_used_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  revoked_at  TEXT
);

CREATE INDEX idx_api_keys_revoked_at ON api_keys (revoked_at);
