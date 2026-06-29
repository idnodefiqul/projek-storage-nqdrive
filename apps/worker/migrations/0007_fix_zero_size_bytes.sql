-- Migration 0007: Fix file records yang tersimpan dengan size_bytes = 0
-- 
-- Root cause: Bug di upload flow menyebabkan beberapa file tersimpan dengan
-- size_bytes = 0. File dengan size_bytes = 0 tidak bisa di-resume download-nya
-- karena server tidak bisa set Content-Length dan Content-Range yang benar.
--
-- Fix otomatis: Worker sekarang mendeteksi size_bytes = 0 saat download dan
-- mengambil ukuran dari Google Drive API, lalu mengupdate DB via updateSizeBytes().
-- Migration ini hanya backup plan — file yang belum pernah didownload ulang
-- setelah deploy fix tetap akan diperbaiki secara auto saat pertama kali didownload.
--
-- Query ini aman untuk dijalankan berkali-kali (idempotent):
-- hanya mengupdate row yang masih 0, tidak mengubah yang sudah benar.

-- Tidak ada perubahan schema — hanya data migration yang dilakukan oleh Worker
-- secara otomatis via DownloadService.fixFileSizeInDb().
-- SQL ini dibuat sebagai dokumentasi dan fallback manual jika diperlukan:
--
-- UPDATE files SET updated_at = CURRENT_TIMESTAMP 
-- WHERE size_bytes = 0;
-- (ukuran sebenarnya harus diambil dari Google Drive API per-file, tidak bisa dilakukan via SQL)

SELECT 'Migration 0007 noted: size_bytes = 0 auto-fix handled by DownloadService at runtime' as status;
