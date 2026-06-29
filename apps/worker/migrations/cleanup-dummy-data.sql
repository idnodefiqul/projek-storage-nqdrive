-- Cleanup script: hapus semua data dummy dari seed.sql yang tidak sengaja masuk production
-- Jalankan dengan: wrangler d1 execute nqdrive-db --remote --file=./migrations/cleanup-dummy-data.sql

-- Hapus file dummy yang terikat ke dummy account (wajib dilakukan dulu karena FK RESTRICT)
DELETE FROM files WHERE provider_file_id = 'dummy-google-file-id-1';

-- Hapus folder dummy
DELETE FROM folders WHERE name IN ('Documents', 'Backups');

-- Hapus dummy Google Drive account
DELETE FROM drive_accounts WHERE email = 'dummy-account@example.com';
