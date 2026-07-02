-- Migration: 0012_add_sha256_and_password.sql
-- Menambahkan kolom SHA-256 checksum dan password protection untuk file download.
--
-- sha256_hash     : hex string 64 karakter, dihitung di browser saat upload.
-- download_password : PBKDF2 hash password (NULL = tanpa password).

ALTER TABLE files ADD COLUMN sha256_hash TEXT DEFAULT NULL;
ALTER TABLE files ADD COLUMN download_password TEXT DEFAULT NULL;
