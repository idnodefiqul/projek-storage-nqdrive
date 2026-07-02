-- Tambahkan kolom share_code
ALTER TABLE files ADD COLUMN share_code TEXT DEFAULT '' NOT NULL;

-- Update existing records dengan 23 karakter random (hexadecimal) sebagai fallback untuk file lama
UPDATE files SET share_code = substr(hex(randomblob(12)), 1, 23) WHERE share_code = '';
