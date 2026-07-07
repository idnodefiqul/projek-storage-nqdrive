import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { createFolderSchema } from "@nqdrive/api";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { requireAuth } from "../middleware/require-auth.middleware";
import { FolderRepository } from "../database/folder.repository";
import { FileRepository } from "../database/file.repository";
import { writeAuditLog } from "../utils/audit";
import type { Env } from "../config/env";

const folderRoutes = new Hono<{ Bindings: Env }>();

folderRoutes.use("*", requireAuth);

const renameFolderSchema = z.object({ name: z.string().min(1).max(255) });

/**
 * GET /api/folders
 * Lists folders under a parent — accepts ?parentFolderId=<id> (internal use only).
 * Frontend should prefer /api/folders/resolve for human-readable navigation.
 * Hanya menampilkan folder yang TIDAK di-trash (deleted_at IS NULL) — dihandle oleh repository.
 */
folderRoutes.get("/", async (c) => {
  const parentFolderIdParam = c.req.query("parentFolderId");
  const parentFolderId = parentFolderIdParam ? Number(parentFolderIdParam) : null;

  const repository = new FolderRepository(c.env.DB);
  const folders = await repository.findByParent(parentFolderId);

  return c.json({ success: true, data: { folders } });
});

/**
 * GET /api/folders/resolve?folder=Windows/11
 * GET /api/folders/resolve?folder=Scripts
 * GET /api/folders/resolve                   (tanpa param = root)
 *
 * Resolves a human-readable slash-separated path to folder metadata + children.
 * Menggunakan query param "folder" (bukan "path") agar konsisten dengan URL dashboard.
 */
folderRoutes.get("/resolve", async (c) => {
  // Baca dari query param "folder" — fallback ke "path" untuk backward-compat
  const rawPath = c.req.query("folder") ?? c.req.query("path") ?? "";
  const repository = new FolderRepository(c.env.DB);

  // Empty path = root
  if (!rawPath || rawPath === "/") {
    const children = await repository.findByParent(null);
    return c.json({
      success: true,
      data: { folder: null, folderId: null, ancestors: [], children },
    });
  }

  const segments = rawPath
    .split("/")
    .map((s) => decodeURIComponent(s.trim()))
    .filter(Boolean);

  if (segments.length === 0) {
    const children = await repository.findByParent(null);
    return c.json({
      success: true,
      data: { folder: null, folderId: null, ancestors: [], children },
    });
  }

  const resolved = await repository.resolvePathToId(segments);

  if (!resolved) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: "Path folder tidak ditemukan." } },
      404
    );
  }

  const children = await repository.findByParent(resolved.id);
  const currentFolder = resolved.ancestors[resolved.ancestors.length - 1]!;
  // ancestors untuk breadcrumb = semua kecuali yang terakhir (itu adalah folder saat ini)
  const ancestors = resolved.ancestors.slice(0, -1);

  return c.json({
    success: true,
    data: {
      folder: currentFolder,
      folderId: resolved.id,
      ancestors,
      children,
    },
  });
});

/**
 * GET /api/folders/:id/ancestors
 * Returns the ancestor chain for a given folder ID, root → direct parent.
 */
folderRoutes.get("/:id/ancestors", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ success: false, error: { code: "INVALID_ID", message: "ID tidak valid." } }, 400);
  }

  const repository = new FolderRepository(c.env.DB);
  const folder = await repository.findById(id);
  if (!folder) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Folder tidak ditemukan." } }, 404);
  }

  const ancestors = await repository.getAncestors(id);
  return c.json({ success: true, data: { folder, ancestors } });
});

folderRoutes.post("/:id/share", async (c) => {
  const id = Number(c.req.param("id"));
  const repository = new FolderRepository(c.env.DB);
  const folder = await repository.findById(id);
  if (!folder) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Folder tidak ditemukan." } }, 404);
  }
  const uuid = uuidv4();
  await repository.setPublic(id, uuid);
  writeAuditLog(c, { action: "folder.share", status: "success", detail: folder.name });
  return c.json({
    success: true,
    data: { shareUuid: uuid, pageUrl: `/folder/${uuid}/${encodeURIComponent(folder.name)}` },
  });
});

folderRoutes.delete("/:id/share", async (c) => {
  const id = Number(c.req.param("id"));
  const repository = new FolderRepository(c.env.DB);
  const folder = await repository.findById(id);
  if (!folder) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Folder tidak ditemukan." } }, 404);
  }
  await repository.setPrivate(id);
  writeAuditLog(c, { action: "folder.unshare", status: "success", detail: folder.name });
  return c.json({ success: true, data: { message: "Folder tidak lagi dibagikan publik." } });
});
folderRoutes.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const repository = new FolderRepository(c.env.DB);
  const folder = await repository.findById(id);

  if (!folder) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Folder tidak ditemukan." } }, 404);
  }
  return c.json({ success: true, data: { folder } });
});

folderRoutes.post("/", zValidator("json", createFolderSchema), async (c) => {
  const input = c.req.valid("json");
  const repository = new FolderRepository(c.env.DB);

  const folder = await repository.create({
    name: input.name,
    parentFolderId: input.parentFolderId ?? null,
  });

  writeAuditLog(c, { action: "folder.create", status: "success", detail: input.name });
  return c.json({ success: true, data: { folder } }, 201);
});

folderRoutes.patch("/:id", zValidator("json", renameFolderSchema), async (c) => {
  const id = Number(c.req.param("id"));
  const { name } = c.req.valid("json");
  const repository = new FolderRepository(c.env.DB);

  const existing = await repository.findById(id);
  if (!existing) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Folder tidak ditemukan." } }, 404);
  }

  await repository.rename(id, name);
  writeAuditLog(c, { action: "folder.rename", status: "success", detail: name });
  return c.json({ success: true, data: { message: "Folder berhasil diganti nama." } });
});

/**
 * DELETE /api/folders/:id
 * Memindahkan folder ke Trash (soft delete).
 * - Folder itu sendiri + semua sub-folder ikut di-soft-delete
 * - Semua file di dalam folder (termasuk sub-folder) ikut di-soft-delete
 * - File public otomatis diubah ke private
 */
folderRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const folderRepository = new FolderRepository(c.env.DB);
  const fileRepository = new FileRepository(c.env.DB);

  const existing = await folderRepository.findById(id);
  if (!existing) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Folder tidak ditemukan." } }, 404);
  }

  // Soft delete folder utama
  await folderRepository.softDelete(id);

  // Soft delete semua sub-folder secara rekursif
  await folderRepository.softDeleteDescendants(id);

  // Soft delete semua file langsung dalam folder ini
  await fileRepository.softDeleteByFolderId(id);

  // Soft delete file di sub-folder secara rekursif
  const softDeleteFilesRecursive = async (parentId: number) => {
    const { results: subFolders } = await c.env.DB
      .prepare("SELECT id FROM folders WHERE parent_folder_id = ? AND deleted_at IS NOT NULL")
      .bind(parentId)
      .all<{ id: number }>();
    for (const sub of subFolders) {
      await fileRepository.softDeleteByFolderId(sub.id);
      await softDeleteFilesRecursive(sub.id);
    }
  };
  await softDeleteFilesRecursive(id);

  writeAuditLog(c, { action: "folder.delete", status: "warning", detail: existing.name });
  return c.json({ success: true, data: { message: "Folder dipindahkan ke Trash." } });
});

export { folderRoutes };
