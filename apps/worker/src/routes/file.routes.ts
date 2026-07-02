import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { listFilesQuerySchema, renameFileSchema, updateFileVisibilitySchema } from "@nqdrive/api";
import { requireAuth } from "../middleware/require-auth.middleware";
import { FileRepository } from "../database/file.repository";
import { DriveAccountRepository } from "../database/drive-account.repository";
import { GoogleAccountConnectionService } from "../services/google-account-connection.service";
import { StorageProviderFactory } from "@nqdrive/storage";
import { DEFAULT_PAGE_SIZE } from "@nqdrive/shared";
import type { Env } from "../config/env";
import type { PaginatedData, FileWithAccount } from "@nqdrive/types";

const fileRoutes = new Hono<{ Bindings: Env }>();

fileRoutes.use("*", requireAuth);

/**
 * GET /api/files
 * Paginated, searchable, filterable listing for the dashboard's Files page.
 * Query params validated by listFilesQuerySchema (page, pageSize, search, folderId, visibility).
 * Hanya menampilkan file yang TIDAK di-trash (deleted_at IS NULL) — dihandle oleh repository.
 */
fileRoutes.get("/", zValidator("query", listFilesQuerySchema), async (c) => {
  const query = c.req.valid("query");
  const repository = new FileRepository(c.env.DB);

  const { items, totalItems } = await repository.list({
    page: query.page,
    pageSize: query.pageSize ?? DEFAULT_PAGE_SIZE,
    search: query.search,
    folderId: query.folderId,
    visibility: query.visibility,
  });

  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  const paginated: PaginatedData<FileWithAccount> = {
    items,
    page: query.page,
    pageSize,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
  };

  return c.json({ success: true, data: paginated });
});

fileRoutes.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const repository = new FileRepository(c.env.DB);
  const file = await repository.findById(id);

  if (!file) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "File tidak ditemukan." } }, 404);
  }
  return c.json({ success: true, data: { file } });
});

fileRoutes.patch("/:id/rename", zValidator("json", renameFileSchema), async (c) => {
  const id = Number(c.req.param("id"));
  const { filename } = c.req.valid("json");
  const repository = new FileRepository(c.env.DB);

  const existing = await repository.findById(id);
  if (!existing) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "File tidak ditemukan." } }, 404);
  }

  await repository.rename(id, filename);
  return c.json({ success: true, data: { message: "File berhasil diganti nama." } });
});

/** PATCH /api/files/:id/visibility — toggles between public / private / hidden. */
fileRoutes.patch("/:id/visibility", zValidator("json", updateFileVisibilitySchema), async (c) => {
  const id = Number(c.req.param("id"));
  const { visibility } = c.req.valid("json");
  const repository = new FileRepository(c.env.DB);

  const existing = await repository.findById(id);
  if (!existing) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "File tidak ditemukan." } }, 404);
  }

  await repository.updateVisibility(id, visibility);
  return c.json({ success: true, data: { message: "Visibilitas file berhasil diperbarui." } });
});

/**
 * DELETE /api/files/:id
 * Memindahkan file ke Trash (soft delete) — TIDAK menghapus dari Google Drive.
 * File public otomatis diubah ke private saat masuk Trash.
 * Penghapusan fisik dari Google Drive terjadi saat hapus permanen dari Trash.
 */
fileRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const fileRepository = new FileRepository(c.env.DB);

  const file = await fileRepository.findById(id);
  if (!file) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "File tidak ditemukan." } }, 404);
  }

  // Soft delete: set deleted_at, simpan original_folder_id, ubah public → private
  await fileRepository.softDelete(id);

  return c.json({ success: true, data: { message: "File dipindahkan ke Trash." } });
});

export { fileRoutes };
