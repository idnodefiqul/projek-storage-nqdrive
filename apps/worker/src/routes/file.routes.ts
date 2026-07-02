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

// GET /api/files
fileRoutes.get("/", zValidator("query", listFilesQuerySchema), async (c) => {
  const query = c.req.valid("query");
  const repository = new FileRepository(c.env.DB);
  const { items, totalItems } = await repository.list({
    page: query.page, pageSize: query.pageSize ?? DEFAULT_PAGE_SIZE,
    search: query.search, folderId: query.folderId, visibility: query.visibility,
  });
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  return c.json({ success: true, data: {
    items, page: query.page, pageSize, totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
  } as PaginatedData<FileWithAccount> });
});

// GET /api/files/preview-token?slug=xxx — returns signed token for stream
fileRoutes.get("/preview", async (c) => {
  const slug = c.req.query("file");
  if (!slug) return c.json({ success: false, error: { code: "MISSING_FILE", message: "file wajib." } }, 400);
  const fileRepository = new FileRepository(c.env.DB);
  const file = await fileRepository.findBySlug(slug);
  if (!file) return c.json({ success: false, error: { code: "NOT_FOUND", message: "File tidak ditemukan." } }, 404);

  const expiry = Math.floor(Date.now() / 1000) + 300;
  const data = `${file.id}:${expiry}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(c.env.JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");

  return c.json({ success: true, data: { token: `${file.id}:${expiry}:${sigHex}` } });
});

// GET /api/files/content?slug=xxx
fileRoutes.get("/content", async (c) => {
  const slug = c.req.query("file");
  if (!slug) return c.json({ success: false, error: { code: "MISSING_FILE", message: "file wajib." } }, 400);
  const fileRepository = new FileRepository(c.env.DB);
  const driveAccountRepository = new DriveAccountRepository(c.env.DB);
  const file = await fileRepository.findBySlug(slug);
  if (!file) return c.json({ success: false, error: { code: "NOT_FOUND", message: "File tidak ditemukan." } }, 404);
  if (file.sizeBytes > 5 * 1024 * 1024) return c.json({ success: false, error: { code: "TOO_LARGE", message: "File terlalu besar (maks 5MB)." } }, 413);
  const account = await driveAccountRepository.findById(file.driveAccountId);
  if (!account) return c.json({ success: false, error: { code: "ACCOUNT_NOT_FOUND", message: "Akun drive tidak ditemukan." } }, 404);
  const connectionService = new GoogleAccountConnectionService(c.env);
  const accessToken = await connectionService.getValidAccessToken(account);
  const provider = StorageProviderFactory.resolve(account.provider) as any;
  try {
    const content = await provider.getContent({ credentials: { accessToken }, providerFileId: file.providerFileId });
    return c.json({ success: true, data: { content } });
  } catch (error) {
    return c.json({ success: false, error: { code: "READ_FAILED", message: error instanceof Error ? error.message : "Gagal membaca." } }, 500);
  }
});

// PUT /api/files/content?slug=xxx
fileRoutes.put("/content", async (c) => {
  const slug = c.req.query("file");
  if (!slug) return c.json({ success: false, error: { code: "MISSING_FILE", message: "file wajib." } }, 400);
  const body = await c.req.json<{ content: string }>();
  if (typeof body.content !== "string") return c.json({ success: false, error: { code: "INVALID_BODY", message: "Content harus string." } }, 400);
  const fileRepository = new FileRepository(c.env.DB);
  const driveAccountRepository = new DriveAccountRepository(c.env.DB);
  const file = await fileRepository.findBySlug(slug);
  if (!file) return c.json({ success: false, error: { code: "NOT_FOUND", message: "File tidak ditemukan." } }, 404);
  const account = await driveAccountRepository.findById(file.driveAccountId);
  if (!account) return c.json({ success: false, error: { code: "ACCOUNT_NOT_FOUND", message: "Akun drive tidak ditemukan." } }, 404);
  const connectionService = new GoogleAccountConnectionService(c.env);
  const accessToken = await connectionService.getValidAccessToken(account);
  const provider = StorageProviderFactory.resolve(account.provider) as any;
  try {
    await provider.updateContent({ credentials: { accessToken }, providerFileId: file.providerFileId, content: body.content, mimeType: file.mimeType || "text/plain" });
    return c.json({ success: true, data: { message: "File berhasil diupdate." } });
  } catch (error) {
    return c.json({ success: false, error: { code: "UPDATE_FAILED", message: error instanceof Error ? error.message : "Gagal update." } }, 500);
  }
});

// PATCH /api/files/rename-sync?slug=xxx
fileRoutes.patch("/rename-sync", zValidator("json", renameFileSchema), async (c) => {
  const slug = c.req.query("file");
  if (!slug) return c.json({ success: false, error: { code: "MISSING_FILE", message: "file wajib." } }, 400);
  const { filename } = c.req.valid("json");
  const fileRepository = new FileRepository(c.env.DB);
  const driveAccountRepository = new DriveAccountRepository(c.env.DB);
  const file = await fileRepository.findBySlug(slug);
  if (!file) return c.json({ success: false, error: { code: "NOT_FOUND", message: "File tidak ditemukan." } }, 404);
  const account = await driveAccountRepository.findById(file.driveAccountId);
  if (!account) return c.json({ success: false, error: { code: "ACCOUNT_NOT_FOUND", message: "Akun drive tidak ditemukan." } }, 404);
  const connectionService = new GoogleAccountConnectionService(c.env);
  const accessToken = await connectionService.getValidAccessToken(account);
  const provider = StorageProviderFactory.resolve(account.provider) as any;
  try {
    await provider.rename({ credentials: { accessToken }, providerFileId: file.providerFileId, newName: filename });
    await fileRepository.rename(file.id, filename);
    return c.json({ success: true, data: { message: "File berhasil diganti nama." } });
  } catch (error) {
    return c.json({ success: false, error: { code: "RENAME_FAILED", message: error instanceof Error ? error.message : "Gagal rename." } }, 500);
  }
});

// GET /api/files/:id
fileRoutes.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (isNaN(id)) return c.json({ success: false, error: { code: "NOT_FOUND", message: "File tidak ditemukan." } }, 404);
  const repository = new FileRepository(c.env.DB);
  const file = await repository.findById(id);
  if (!file) return c.json({ success: false, error: { code: "NOT_FOUND", message: "File tidak ditemukan." } }, 404);
  return c.json({ success: true, data: { file } });
});

// PATCH /api/files/:id/rename
fileRoutes.patch("/:id/rename", zValidator("json", renameFileSchema), async (c) => {
  const id = Number(c.req.param("id"));
  if (isNaN(id)) return c.json({ success: false, error: { code: "NOT_FOUND", message: "File tidak ditemukan." } }, 404);
  const { filename } = c.req.valid("json");
  const repository = new FileRepository(c.env.DB);
  const existing = await repository.findById(id);
  if (!existing) return c.json({ success: false, error: { code: "NOT_FOUND", message: "File tidak ditemukan." } }, 404);
  await repository.rename(id, filename);
  return c.json({ success: true, data: { message: "File berhasil diganti nama." } });
});

// PATCH /api/files/:id/visibility
fileRoutes.patch("/:id/visibility", zValidator("json", updateFileVisibilitySchema), async (c) => {
  const id = Number(c.req.param("id"));
  if (isNaN(id)) return c.json({ success: false, error: { code: "NOT_FOUND", message: "File tidak ditemukan." } }, 404);
  const { visibility } = c.req.valid("json");
  const repository = new FileRepository(c.env.DB);
  const existing = await repository.findById(id);
  if (!existing) return c.json({ success: false, error: { code: "NOT_FOUND", message: "File tidak ditemukan." } }, 404);
  await repository.updateVisibility(id, visibility);
  return c.json({ success: true, data: { message: "Visibilitas file berhasil diperbarui." } });
});

// DELETE /api/files/:id
fileRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (isNaN(id)) return c.json({ success: false, error: { code: "NOT_FOUND", message: "File tidak ditemukan." } }, 404);
  const fileRepository = new FileRepository(c.env.DB);
  const file = await fileRepository.findById(id);
  if (!file) return c.json({ success: false, error: { code: "NOT_FOUND", message: "File tidak ditemukan." } }, 404);
  await fileRepository.softDelete(id);
  return c.json({ success: true, data: { message: "File dipindahkan ke Trash." } });
});

export { fileRoutes };
