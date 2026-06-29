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
 * Deletes both the D1 metadata row AND the underlying provider file (Google Drive),
 * in that order reversed: provider first, then DB — if provider deletion fails, we keep
 * the metadata row so the file isn't "lost" from the dashboard while still occupying space.
 */
fileRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const fileRepository = new FileRepository(c.env.DB);
  const driveAccountRepository = new DriveAccountRepository(c.env.DB);

  const file = await fileRepository.findById(id);
  if (!file) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "File tidak ditemukan." } }, 404);
  }

  const account = await driveAccountRepository.findById(file.driveAccountId);
  if (!account) {
    return c.json(
      { success: false, error: { code: "ACCOUNT_NOT_FOUND", message: "Akun penyimpanan untuk file ini tidak ditemukan." } },
      500
    );
  }

  const connectionService = new GoogleAccountConnectionService(c.env);
  const accessToken = await connectionService.getValidAccessToken(account);
  const provider = StorageProviderFactory.resolve(account.provider);

  await provider.delete({ credentials: { accessToken }, providerFileId: file.providerFileId });
  await fileRepository.delete(id);

  return c.json({ success: true, data: { message: "File berhasil dihapus." } });
});

export { fileRoutes };
