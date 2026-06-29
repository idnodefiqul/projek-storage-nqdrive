-- Migration: 0001_initial_schema.sql
-- Tahap 2: Database Schema
--
-- Bagian 1: users & settings
-- users     -> satu-satunya admin lokal (no multi-user, no Google OAuth login)
-- settings  -> key-value store, dipakai antara lain untuk flag first-run setup

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at    TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- Seed default: setup belum selesai sampai admin pertama dibuat.
-- Worker akan mengecek baris ini (atau COUNT(users)) untuk memutuskan
-- apakah halaman /setup harus ditampilkan atau dikembalikan 403.
INSERT INTO settings (key, value) VALUES ('setup_completed', 'false');
