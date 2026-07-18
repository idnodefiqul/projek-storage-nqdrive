import { Hono } from "hono";
import { requireAuth } from "../middleware/require-auth.middleware";
import { FileRepository } from "../database/file.repository";
import { FolderRepository } from "../database/folder.repository";
import { DriveAccountRepository } from "../database/drive-account.repository";
import { GoogleAccountConnectionService } from "../services/google-account-connection.service";
import { StorageProviderFactory } from "@nqdrive/storage";
import { writeAuditLog } from "../utils/audit";
import type { Env } from "../config/env";

const trashRoutes = new Hono<{ Bindings: Env }>();

trashRoutes.use("*", requireAuth);

function toPublicFileTrash(file: any) {
  return {
    fileId: file.fileId ?? file.publicId ?? null,
    accountId: file.accountId ?? null,
    folderId: file.folderPublicId ?? file.originalFolderPublicId ?? null,
    originalFolderId: file.originalFolderPublicId ?? file.folderPublicId ?? null,
    filename: file.filename,
    slug: file.slug,
    sizeBytes: file.sizeBytes,
    mimeType: file.mimeType,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    deletedAt: file.deletedAt,
    driveAccountEmail: file.driveAccountEmail,
    driveAccountProvider: file.driveAccountProvider,
  };
}
function toPublicFolderTrash(folder: any) {
  return {
    folderId: folder.folderId ?? folder.publicId ?? null,
    name: folder.name,
    parentFolderId: folder.parentFolderPublicId ?? null,
    shareUuid: folder.shareUuid,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
    deletedAt: folder.deletedAt,
  };
}

/**
 * GET /api/trash
 * Mengembalikan semua item di Trash (files + folders) untuk ditampilkan di halaman Trash.
 * Professional only, no numeric id
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
      files: (trashedFiles as any[]).map(toPublicFileTrash),
      folders: (trashedFolders as any[]).map(toPublicFolderTrash),
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
 * Dual-mode: fil_xxx or numeric
 */
trashRoutes.post("/restore/file/:id", async (c) => {
  const rawId = c.req.param("id");
  const fileRepository = new FileRepository(c.env.DB);

  const file = await (fileRepository as any).findByPublicIdOrIdIncludingTrashed(rawId) as any;
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

  await fileRepository.restore(file.id);
  writeAuditLog(c, { action: "trash.restore-file", status: "info", detail: `File ID: ${file.id}` });
  return c.json({ success: true, data: { message: "File berhasil dipulihkan." } });
});

/**
 * POST /api/trash/restore/folder/:id
 * Restore folder dari Trash ke parent folder asalnya.
 * Juga mereststore semua sub-folder dan file yang ikut ter-trash.
 * Dual-mode: fld_xxx or numeric
 */
trashRoutes.post("/restore/folder/:id", async (c) => {
  const rawId = c.req.param("id");
  const folderRepository = new FolderRepository(c.env.DB);

  const folder = await (folderRepository as any).findByPublicIdIncludingTrashed
    ? await (folderRepository as any).findByPublicIdOrIdIncludingTrashed?.(rawId) ?? await folderRepository.findByIdIncludingTrashed(Number(rawId))
    : await folderRepository.findByIdIncludingTrashed(Number(rawId));
  // Fallback handling for dual-mode
  let resolvedFolder: any = folder;
  if (!resolvedFolder) {
    resolvedFolder = await (folderRepository as any).findByPublicIdOrId(rawId) as any;
    if (resolvedFolder) {
      // Need trashed version
      resolvedFolder = await folderRepository.findByIdIncludingTrashed(resolvedFolder.id);
    }
  }
  if (!resolvedFolder) {
    // Try direct public id trashed lookup
    const maybe = await (folderRepository as any).findByPublicIdIncludingTrashed?.(rawId);
    if (maybe) resolvedFolder = maybe;
  }

  if (!resolvedFolder) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: "Folder tidak ditemukan di Trash." } },
      404
    );
  }
  if (!resolvedFolder.deletedAt) {
    return c.json(
      { success: false, error: { code: "NOT_TRASHED", message: "Folder ini tidak berada di Trash." } },
      400
    );
  }

  const id = resolvedFolder.id;

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

  writeAuditLog(c, { action: "trash.restore-folder", status: "info", detail: `Folder ID: ${id}` });
  return c.json({ success: true, data: { message: "Folder berhasil dipulihkan." } });
});

/**
 * DELETE /api/trash/file/:id
 * Hapus permanen sebuah file dari Trash.
 * Menghapus file dari Google Drive DAN dari database.
 * Dual-mode: fil_xxx or numeric
 */
trashRoutes.delete("/file/:id", async (c) => {
  const rawId = c.req.param("id");
  const fileRepository = new FileRepository(c.env.DB);
  const driveAccountRepository = new DriveAccountRepository(c.env.DB);

  const file = await (fileRepository as any).findByPublicIdOrIdIncludingTrashed(rawId) as any;
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

  const driveAccountId = file.driveAccountId;

  const account = await driveAccountRepository.findById(file.driveAccountId);
  if (!account) {
    // Akun hilang — hapus dari DB saja
    await fileRepository.delete(file.id);
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

  await fileRepository.delete(file.id);

  // Re-calc quota setelah hapus permanen — kuota harus berkurang
  try {
    const row = await c.env.DB.prepare(
      "SELECT COALESCE(SUM(size_bytes), 0) as total FROM files WHERE drive_account_id = ? AND deleted_at IS NULL"
    ).bind(driveAccountId).first<{ total: number }>();
    const used = row?.total ?? 0;
    const freshAccount = await driveAccountRepository.findById(driveAccountId);
    if (freshAccount) {
      await driveAccountRepository.updateQuota(freshAccount.id, {
        totalBytes: freshAccount.totalStorageBytes,
        usedBytes: used,
        availableBytes: Math.max(0, freshAccount.totalStorageBytes - used),
      });
    }
  } catch (err) {
    console.error(`[trash file delete] gagal recalc quota:`, err);
  }

  return c.json({ success: true, data: { message: "File berhasil dihapus permanen." } });
});

/**
 * DELETE /api/trash/folder/:id
 * Hapus permanen sebuah folder dari Trash.
 * Menghapus semua file di dalam folder dari Google Drive, lalu hapus folder dari DB.
 * Dual-mode: fld_xxx or numeric
 */
trashRoutes.delete("/folder/:id", async (c) => {
  const rawId = c.req.param("id");
  const folderRepository = new FolderRepository(c.env.DB);
  const fileRepository = new FileRepository(c.env.DB);
  const driveAccountRepository = new DriveAccountRepository(c.env.DB);

  let folder: any = await (folderRepository as any).findByPublicIdIncludingTrashed?.(rawId) 
    ?? await (folderRepository as any).findByPublicIdOrId(rawId) 
    ?? await folderRepository.findByIdIncludingTrashed(Number(rawId));
  if (!folder) {
    const byPubOrId = await (folderRepository as any).findByPublicIdOrId(rawId) as any;
    if (byPubOrId) folder = await folderRepository.findByIdIncludingTrashed(byPubOrId.id);
  }
  const id = folder?.id;
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

  // Kumpulkan affected account IDs untuk recalc quota setelahnya
  // Filter undefined to satisfy Set<number> type - driveAccountId is now required number but guard anyway
  const affectedAccountIds = new Set<number>(
    trashedFiles.map(f => f.driveAccountId).filter((id): id is number => typeof id === "number")
  );

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

  // Re-calc quota untuk semua akun yang terdampak
  for (const accountId of affectedAccountIds) {
    try {
      const row = await c.env.DB.prepare(
        "SELECT COALESCE(SUM(size_bytes), 0) as total FROM files WHERE drive_account_id = ? AND deleted_at IS NULL"
      ).bind(accountId).first<{ total: number }>();
      const used = row?.total ?? 0;
      const account = await driveAccountRepository.findById(accountId);
      if (account) {
        await driveAccountRepository.updateQuota(account.id, {
          totalBytes: account.totalStorageBytes,
          usedBytes: used,
          availableBytes: Math.max(0, account.totalStorageBytes - used),
        });
      }
    } catch (err) {
      console.error(`[trash empty] gagal recalc quota account ${accountId}:`, err);
    }
  }

  writeAuditLog(c, { action: "trash.empty", status: "warning", detail: `${trashedFiles.length} files, ${trashedFolders.length} folders` });
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
