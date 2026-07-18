import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { listFilesQuerySchema, renameFileSchema, updateFileVisibilitySchema, moveFileSchema, copyFileSchema } from "@nqdrive/api";
import { requireAuth } from "../middleware/require-auth.middleware";
import { FileRepository } from "../database/file.repository";
import { DriveAccountRepository } from "../database/drive-account.repository";
import { GoogleAccountConnectionService } from "../services/google-account-connection.service";
import { resolveCredentials } from "../utils/credentials";
import { StorageProviderFactory } from "@nqdrive/storage";
import { DEFAULT_PAGE_SIZE } from "@nqdrive/shared";
import { writeAuditLog } from "../utils/audit";
import type { Env } from "../config/env";
import type { PaginatedData, FileWithAccount } from "@nqdrive/types";

const fileRoutes = new Hono<{ Bindings: Env }>();

fileRoutes.use("*", requireAuth);

// Helper to convert file to professional response shape - 100% professional, no numeric id
function toPublicFile(file: any) {
  const fileId = file.fileId ?? file.publicId ?? file.public_id ?? null;
  const accountId = file.accountId ?? file.driveAccountPublicId ?? null;
  const folderId = file.folderPublicId ?? file.folder_public_id ?? null;
  return {
    fileId,
    accountId,
    folderId, // fld_xxx or null for root — professional only
    filename: file.filename,
    slug: file.slug,
    shareCode: file.shareCode,
    providerFileId: file.providerFileId,
    sizeBytes: file.sizeBytes,
    mimeType: file.mimeType,
    visibility: file.visibility,
    downloadCount: file.downloadCount,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    deletedAt: file.deletedAt,
    driveAccountEmail: file.driveAccountEmail,
    driveAccountProvider: file.driveAccountProvider,
  };
}

// GET /api/files
fileRoutes.get("/", zValidator("query", listFilesQuerySchema), async (c) => {
  const query = c.req.valid("query");
  const fileRepository = new FileRepository(c.env.DB);
  const folderRepository = new (await import("../database/folder.repository")).FolderRepository(c.env.DB);

  // Resolve folderId which can be string public_id (fld_xxx) or number legacy
  // "" (string kosong) = ROOT → hanya file tanpa folder (folder_id IS NULL).
  // undefined (param tidak dikirim) = tanpa filter folder (semua file).
  let folderId: number | undefined = undefined;
  let folderPublicId: string | undefined = undefined;
  const rawFolderId = (query as any).folderId;

  if (rawFolderId !== undefined && rawFolderId !== null) {
    if (rawFolderId === "" || rawFolderId === 0) {
      folderId = 0; // root
    } else if (typeof rawFolderId === "string" && rawFolderId.startsWith("fld_")) {
      folderPublicId = rawFolderId;
      const folder = await folderRepository.findByPublicId(rawFolderId);
      if (folder) {
        folderId = folder.id;
      } else {
        // Folder tidak ditemukan → fail-closed (jangan tampilkan semua file)
        folderId = -1;
      }
    } else if (typeof rawFolderId === "string" && /^\d+$/.test(rawFolderId)) {
      folderId = Number(rawFolderId);
    } else if (typeof rawFolderId === "number") {
      folderId = rawFolderId;
    } else if (typeof rawFolderId === "string") {
      // Try generic public_id lookup
      const folder = await folderRepository.findByPublicId(rawFolderId);
      if (folder) folderId = folder.id;
      else {
        const num = Number(rawFolderId);
        folderId = isNaN(num) ? -1 : num;
      }
    }
  }

  const { items, totalItems } = await fileRepository.list({
    page: query.page, pageSize: query.pageSize ?? DEFAULT_PAGE_SIZE,
    search: query.search, folderId, visibility: query.visibility,
  });

  const publicItems = items.map(toPublicFile);
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  return c.json({ success: true, data: {
    items: publicItems, page: query.page, pageSize, totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
  } as any });
});

// GET /api/files/preview-token?slug=xxx — returns signed token for stream
fileRoutes.get("/preview", async (c) => {
  const slug = c.req.query("file");
  if (!slug) return c.json({ success: false, error: { code: "MISSING_FILE", message: "file wajib." } }, 400);
  const fileRepository = new FileRepository(c.env.DB);
  const file = await fileRepository.findBySlug(slug) as any;
  if (!file) return c.json({ success: false, error: { code: "NOT_FOUND", message: "File tidak ditemukan." } }, 404);

  const expiry = Math.floor(Date.now() / 1000) + 300;
  // Professional: use publicId fil_xxx if available, fallback to numeric id for legacy
  const identifier = file.fileId ?? file.publicId ?? String(file.id);
  const data = `${identifier}:${expiry}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(c.env.JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");

  return c.json({ success: true, data: { token: `${identifier}:${expiry}:${sigHex}` } });
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

// GET /api/files/:id — dual-mode: accept fil_xxx or numeric legacy
fileRoutes.get("/:id", async (c) => {
  const rawId = c.req.param("id");
  const repository = new FileRepository(c.env.DB);
  const file = await (repository as any).findByPublicIdOrId(rawId);
  if (!file) return c.json({ success: false, error: { code: "NOT_FOUND", message: "File tidak ditemukan." } }, 404);
  return c.json({ success: true, data: { file: toPublicFile(file) } });
});

// PATCH /api/files/:id/rename — dual-mode
fileRoutes.patch("/:id/rename", zValidator("json", renameFileSchema), async (c) => {
  const rawId = c.req.param("id");
  const { filename } = c.req.valid("json");
  const repository = new FileRepository(c.env.DB);
  const existing = await (repository as any).findByPublicIdOrId(rawId) as any;
  if (!existing) return c.json({ success: false, error: { code: "NOT_FOUND", message: "File tidak ditemukan." } }, 404);
  await repository.rename(existing.id, filename);
  writeAuditLog(c, { action: "file.rename", status: "success", detail: filename });
  return c.json({ success: true, data: { message: "File berhasil diganti nama." } });
});

// PATCH /api/files/:id/visibility — dual-mode
fileRoutes.patch("/:id/visibility", zValidator("json", updateFileVisibilitySchema), async (c) => {
  const rawId = c.req.param("id");
  const { visibility } = c.req.valid("json");
  const repository = new FileRepository(c.env.DB);
  const existing = await (repository as any).findByPublicIdOrId(rawId) as any;
  if (!existing) return c.json({ success: false, error: { code: "NOT_FOUND", message: "File tidak ditemukan." } }, 404);
  await repository.updateVisibility(existing.id, visibility);
  writeAuditLog(c, { action: "file.visibility", status: "info", detail: `${existing.filename} → ${visibility}` });
  return c.json({ success: true, data: { message: "Visibilitas file berhasil diperbarui." } });
});

// DELETE /api/files/:id — dual-mode
fileRoutes.delete("/:id", async (c) => {
  const rawId = c.req.param("id");
  const fileRepository = new FileRepository(c.env.DB);
  const driveAccountRepository = new DriveAccountRepository(c.env.DB);
  const file = await (fileRepository as any).findByPublicIdOrId(rawId) as any;
  if (!file) return c.json({ success: false, error: { code: "NOT_FOUND", message: "File tidak ditemukan." } }, 404);
  await fileRepository.softDelete(file.id);

  // Re-calc quota dari DB SUM agar akurat — fix kuota "bertambah terus" tidak pernah berkurang
  try {
    const row = await c.env.DB.prepare(
      "SELECT COALESCE(SUM(size_bytes), 0) as total FROM files WHERE drive_account_id = ? AND deleted_at IS NULL"
    ).bind(file.driveAccountId).first<{ total: number }>();
    const used = row?.total ?? 0;
    const account = await driveAccountRepository.findById(file.driveAccountId);
    if (account) {
      await driveAccountRepository.updateQuota(account.id, {
        totalBytes: account.totalStorageBytes,
        usedBytes: used,
        availableBytes: Math.max(0, account.totalStorageBytes - used),
      });
    }
  } catch (err) {
    console.error(`[file delete] gagal recalc quota account ${file.driveAccountId}:`, err);
  }

  writeAuditLog(c, { action: "file.delete", status: "warning", detail: file.filename });
  return c.json({ success: true, data: { message: "File dipindahkan ke Trash." } });
});

/**
 * Resolve targetFolderId (fld_xxx / numeric legacy / null=root) ke internal id.
 * Return { ok: false } jika folder tujuan tidak ditemukan / sudah di-trash.
 */
async function resolveTargetFolder(
  db: D1Database,
  rawTarget: string | number | null
): Promise<{ ok: true; folderId: number | null; folderName: string | null } | { ok: false }> {
  if (rawTarget === null || rawTarget === "" || rawTarget === 0) {
    return { ok: true, folderId: null, folderName: null };
  }
  const { FolderRepository } = await import("../database/folder.repository");
  const folderRepo = new FolderRepository(db);
  const folder = await folderRepo.findByPublicIdOrId(rawTarget);
  if (!folder) return { ok: false };
  return { ok: true, folderId: folder.id, folderName: folder.name };
}

/**
 * POST /api/files/:id/move
 * Pindahkan file ke folder lain (targetFolderId: fld_xxx atau null = root).
 * Folder bersifat virtual (kolom folder_id) — file di provider tidak tersentuh.
 */
fileRoutes.post("/:id/move", zValidator("json", moveFileSchema), async (c) => {
  const rawId = c.req.param("id");
  const { targetFolderId } = c.req.valid("json");
  const fileRepository = new FileRepository(c.env.DB);

  const file = await (fileRepository as any).findByPublicIdOrId(rawId) as any;
  if (!file) return c.json({ success: false, error: { code: "NOT_FOUND", message: "File tidak ditemukan." } }, 404);

  const target = await resolveTargetFolder(c.env.DB, targetFolderId);
  if (!target.ok) {
    return c.json({ success: false, error: { code: "TARGET_NOT_FOUND", message: "Folder tujuan tidak ditemukan." } }, 404);
  }

  // No-op: sudah berada di folder tujuan
  if ((file.folderIdNumeric ?? null) === target.folderId) {
    return c.json({ success: true, data: { file: toPublicFile(file), moved: false } });
  }

  await fileRepository.updateFolderId(file.id, target.folderId);
  const updated = await fileRepository.findById(file.id);

  writeAuditLog(c, {
    action: "file.move",
    status: "success",
    detail: `${file.filename} → ${target.folderName ?? "Root"}`,
  });
  return c.json({ success: true, data: { file: toPublicFile(updated ?? file), moved: true } });
});

/**
 * POST /api/files/:id/copy
 * Salin file ke folder lain — server-side copy di provider (data tidak lewat worker).
 * Saat ini hanya Google Drive yang mendukung (provider.copyFile).
 */
fileRoutes.post("/:id/copy", zValidator("json", copyFileSchema), async (c) => {
  const rawId = c.req.param("id");
  const { targetFolderId } = c.req.valid("json");
  const fileRepository = new FileRepository(c.env.DB);
  const driveAccountRepository = new DriveAccountRepository(c.env.DB);

  const file = await (fileRepository as any).findByPublicIdOrId(rawId) as any;
  if (!file) return c.json({ success: false, error: { code: "NOT_FOUND", message: "File tidak ditemukan." } }, 404);

  const account = await driveAccountRepository.findById(file.driveAccountId);
  if (!account) return c.json({ success: false, error: { code: "ACCOUNT_NOT_FOUND", message: "Akun drive tidak ditemukan." } }, 404);

  const provider = StorageProviderFactory.resolve(account.provider) as any;
  if (typeof provider.copyFile !== "function") {
    return c.json({
      success: false,
      error: { code: "PROVIDER_NOT_SUPPORTED", message: "Provider ini belum mendukung salin file." },
    }, 422);
  }

  const target = await resolveTargetFolder(c.env.DB, targetFolderId);
  if (!target.ok) {
    return c.json({ success: false, error: { code: "TARGET_NOT_FOUND", message: "Folder tujuan tidak ditemukan." } }, 404);
  }

  // Nama salinan: "nama (copy).ext"
  const dotIdx = file.filename.lastIndexOf(".");
  const copyName = dotIdx > 0
    ? `${file.filename.slice(0, dotIdx)} (copy)${file.filename.slice(dotIdx)}`
    : `${file.filename} (copy)`;

  const credentials = await resolveCredentials(account, c.env);

  let newProviderFileId: string;
  try {
    const result = await provider.copyFile({
      credentials,
      providerFileId: file.providerFileId,
      filename: copyName,
    });
    newProviderFileId = result.providerFileId;
  } catch (error) {
    writeAuditLog(c, { action: "file.copy", status: "error", detail: file.filename });
    return c.json({
      success: false,
      error: { code: "COPY_FAILED", message: error instanceof Error ? error.message : "Gagal menyalin file di provider." },
    }, 500);
  }

  const { UploadService } = await import("../services/upload.service");
  const uploadService = new UploadService(c.env);
  const slug = await uploadService.generateUniqueSlug(copyName);
  const shareCode = UploadService.generateShareCode();

  const newFile = await fileRepository.create({
    filename: copyName,
    slug,
    providerFileId: newProviderFileId,
    driveAccountId: account.id,
    folderId: target.folderId,
    sizeBytes: file.sizeBytes,
    mimeType: file.mimeType,
    visibility: "private",
    shareCode,
  });

  // Re-calc quota dari DB SUM — idempotent, pola sama dengan finalizeUpload
  try {
    const freshUsed = await uploadService.getDbUsedBytes(account.id);
    await driveAccountRepository.updateQuota(account.id, {
      totalBytes: account.totalStorageBytes,
      usedBytes: freshUsed,
      availableBytes: Math.max(0, account.totalStorageBytes - freshUsed),
    });
  } catch (err) {
    console.error(`[file copy] gagal recalc quota account ${account.id}:`, err);
  }

  writeAuditLog(c, {
    action: "file.copy",
    status: "success",
    detail: `${file.filename} → ${target.folderName ?? "Root"}`,
  });
  return c.json({ success: true, data: { file: toPublicFile(newFile) } }, 201);
});

export { fileRoutes };
