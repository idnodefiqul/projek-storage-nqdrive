-- Migration: 0003_folders.sql
-- Tahap 2: Database Schema
--
-- folders -> struktur folder virtual (self-referencing untuk sub-folder).
-- ON DELETE CASCADE pada parent_folder_id: menghapus folder induk akan ikut
-- menghapus seluruh sub-folder di bawahnya, sesuai perilaku file manager pada umumnya.

CREATE TABLE folders (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  parent_folder_id INTEGER,
  created_at       TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at       TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY (parent_folder_id) REFERENCES folders (id) ON DELETE CASCADE
);

CREATE INDEX idx_folders_parent_folder_id ON folders (parent_folder_id);
