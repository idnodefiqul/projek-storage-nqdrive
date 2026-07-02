import { Hono } from "hono";
import { requireAuth } from "../middleware/require-auth.middleware";
import { FileRepository } from "../database/file.repository";
import { FolderRepository } from "../database/folder.repository";
import { DriveAccountRepository } from "../database/drive-account.repository";
import { GoogleAccountConnectionService } from "../services/google-account-connection.service";
import { StorageProviderFactory } from "@nqdrive/storage";
import type { Env } from "../config/env";

const trashRoutes = new Hono<{ Bindings: Env }>();

trashRoutes.use("*", requireAuth);

/**
 * GET /api/trash
 * Mengembalikan semua item di Trash (files + folders) untuk ditampilkan di halaman Trash.
 */
trashRoutes.get("/", async (c) => {
  const fileRepository = new FileRepository(c.env.DB);
  const folderRepository = new FolderRepository(c.env.DB);

  const [trashedFiles, trashedFolders] = await Promise.all([
    fileRepository.listTrashed(),
    folderRepository.listTrashed(),
  ]);

  return c.json({
    success: true,
    data: {
      files: trashedFiles,
      folders: trashedFolders,
      totalItems: trashedFiles.length + trashedFolders.length,
    },
  });
});

/**
 * GET /api/trash/count
 * Mengembalikan jumlah item di Trash (untuk badge di sidebar).
 */
trashRoutes.get("/count", async (c) => {
  const fileRepository = new FileRepository(c.env.DB);
  const folderRepository = new FolderRepository(c.env.DB);

  const [fileCount, folderCount] = await Promise.all([
    fileRepository.countTrashed(),
    folderRepository.countTrashed(),
  ]);

  return c.json({
    success: true,
    data: { count: fileCount + folderCount },
  });
});

/**
 * POST /api/trash/restore/file/:id
 * Restore file dari Trash ke folder asalnya.
 */
trashRoutes.post("/restore/file/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const fileRepository = new FileRepository(c.env.DB);

  const file = await fileRepository.findByIdIncludingTrashed(id);
  if (!file) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: "File tidak ditemukan di Trash." } },
      404
    );
  }
  if (!file.deletedAt) {
    return c.json(
      { success: false, error: { code: "NOT_TRASHED", message: "File ini tidak berada di Trash." } },
      400
    );
  }

  await fileRepository.restore(id);
  return c.json({ success: true, data: { message: "File berhasil dipulihkan." } });
});

/**
 * POST /api/trash/restore/folder/:id
 * Restore folder dari Trash ke parent folder asalnya.
 * Juga mereststore semua sub-folder dan file yang ikut ter-trash.
 */
trashRoutes.post("/restore/folder/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const fileRepository = new FileRepository(c.env.DB);
  const folderRepository = new FolderRepository(c.env.DB);

  const folder = await folderRepository.findByIdIncludingTrashed(id);
  if (!folder) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: "Folder tidak ditemukan di Trash." } },
      404
    );
  }
  if (!folder.deletedAt) {
    return c.json(
      { success: false, error: { code: "NOT_TRASHED", message: "Folder ini tidak berada di Trash." } },
      400
    );
  }

  // Restore folder utama
  await folderRepository.restore(id);

  // Restore semua sub-folder yang ikut ter-trash
  await folderRepository.restoreDescendants(id);

  // Restore semua file yang original_folder_id == id (file langsung dalam folder ini)
  await c.env.DB
    .prepare(
      `UPDATE files
       SET deleted_at = NULL,
           folder_id = original_folder_id,
           original_folder_id = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE original_folder_id = ? AND deleted_at IS NOT NULL`
    )
    .bind(id)
    .run();

  // Restore file di sub-folder secara rekursif
  const restoreFilesRecursive = async (folderId: number) => {
    const { results: subFolders } = await c.env.DB
      .prepare("SELECT id FROM folders WHERE parent_folder_id = ?")
      .bind(folderId)
      .all<{ id: number }>();
    for (const sub of subFolders) {
      await c.env.DB
        .prepare(
          `UPDATE files
           SET deleted_at = NULL,
               folder_id = original_folder_id,
               original_folder_id = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE original_folder_id = ? AND deleted_at IS NOT NULL`
        )
        .bind(sub.id)
        .run();
      await restoreFilesRecursive(sub.id);
    }
  };
  await restoreFilesRecursive(id);

  return c.json({ success: true, data: { message: "Folder berhasil dipulihkan." } });
});

/**
 * DELETE /api/trash/file/:id
 * Hapus permanen sebuah file dari Trash.
 * Menghapus file dari Google Drive DAN dari database.
 */
trashRoutes.delete("/file/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const fileRepository = new FileRepository(c.env.DB);
  const driveAccountRepository = new DriveAccountRepository(c.env.DB);

  const file = await fileRepository.findByIdIncludingTrashed(id);
  if (!file) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: "File tidak ditemukan." } },
      404
    );
  }
  if (!file.deletedAt) {
    return c.json(
      { success: false, error: { code: "NOT_TRASHED", message: "Gunakan endpoint hapus biasa untuk file aktif." } },
      400
    );
  }

  const account = await driveAccountRepository.findById(file.driveAccountId);
  if (!account) {
    // Akun hilang — hapus dari DB saja
    await fileRepository.delete(id);
    return c.json({ success: true, data: { message: "File dihapus dari database (akun penyimpanan tidak ditemukan)." } });
  }

  try {
    const connectionService = new GoogleAccountConnectionService(c.env);
    const accessToken = await connectionService.getValidAccessToken(account);
    const provider = StorageProviderFactory.resolve(account.provider);
    await provider.delete({ credentials: { accessToken }, providerFileId: file.providerFileId });
  } catch (err) {
    console.error("Gagal hapus file dari provider, lanjut hapus dari DB:", err);
  }

  await fileRepository.delete(id);
  return c.json({ success: true, data: { message: "File berhasil dihapus permanen." } });
});

/**
 * DELETE /api/trash/folder/:id
 * Hapus permanen sebuah folder dari Trash.
 * Menghapus semua file di dalam folder dari Google Drive, lalu hapus folder dari DB.
 */
trashRoutes.delete("/folder/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const folderRepository = new FolderRepository(c.env.DB);
  const fileRepository = new FileRepository(c.env.DB);
  const driveAccountRepository = new DriveAccountRepository(c.env.DB);

  const folder = await folderRepository.findByIdIncludingTrashed(id);
  if (!folder) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: "Folder tidak ditemukan." } },
      404
    );
  }
  if (!folder.deletedAt) {
    return c.json(
      { success: false, error: { code: "NOT_TRASHED", message: "Gunakan endpoint hapus biasa untuk folder aktif." } },
      400
    );
  }

  // Hapus semua file dalam folder dari Google Drive
  const { results: filesToDelete } = await c.env.DB
    .prepare("SELECT * FROM files WHERE original_folder_id = ? AND deleted_at IS NOT NULL")
    .bind(id)
    .all<{
      id: number; provider_file_id: string; drive_account_id: number;
    }>();

  const connectionService = new GoogleAccountConnectionService(c.env);

  for (const fileRow of filesToDelete) {
    try {
      const account = await driveAccountRepository.findById(fileRow.drive_account_id);
      if (account) {
        const accessToken = await connectionService.getValidAccessToken(account);
        const provider = StorageProviderFactory.resolve(account.provider);
        await provider.delete({ credentials: { accessToken }, providerFileId: fileRow.provider_file_id });
      }
    } catch (err) {
      console.error(`Gagal hapus file ${fileRow.id} dari provider:`, err);
    }
    await fileRepository.delete(fileRow.id);
  }

  // Hapus folder dari DB (cascade otomatis menghapus sub-folder via FK)
  await folderRepository.delete(id);

  return c.json({ success: true, data: { message: "Folder berhasil dihapus permanen." } });
});

/**
 * DELETE /api/trash/empty
 * Kosongkan seluruh Trash — hapus semua item secara permanen.
 */
trashRoutes.delete("/empty", async (c) => {
  const fileRepository = new FileRepository(c.env.DB);
  const folderRepository = new FolderRepository(c.env.DB);
  const driveAccountRepository = new DriveAccountRepository(c.env.DB);

  const trashedFiles = await fileRepository.listTrashed();
  const connectionService = new GoogleAccountConnectionService(c.env);

  // Hapus semua file fisik dari Google Drive
  for (const file of trashedFiles) {
    try {
      const account = await driveAccountRepository.findById(file.driveAccountId);
      if (account) {
        const accessToken = await connectionService.getValidAccessToken(account);
        const provider = StorageProviderFactory.resolve(account.provider);
        await provider.delete({ credentials: { accessToken }, providerFileId: file.providerFileId });
      }
    } catch (err) {
      console.error(`Gagal hapus file ${file.id} dari provider:`, err);
    }
    await fileRepository.delete(file.id);
  }

  // Hapus semua folder yang di-trash dari DB
  const trashedFolders = await folderRepository.listTrashed();
  for (const folder of trashedFolders) {
    await folderRepository.delete(folder.id);
  }

  return c.json({
    success: true,
    data: {
      message: "Trash berhasil dikosongkan.",
      deletedFiles: trashedFiles.length,
      deletedFolders: trashedFolders.length,
    },
  });
});

export { trashRoutes };
