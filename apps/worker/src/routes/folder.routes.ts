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

function toPublicFolder(folder: any) {
  const folderId = folder.folderId ?? folder.publicId ?? folder.public_id ?? null;
  const parentFolderId = folder.parentFolderPublicId ?? folder.parentFolderId ?? null;
  // Determine if parentFolderId is professional (fld_) or should be null
  const profParentId = parentFolderId && typeof parentFolderId === "string" && parentFolderId.startsWith("fld_") 
    ? parentFolderId 
    : (folder.parentFolderPublicId ?? null);
  return {
    folderId,
    parentFolderId: profParentId,
    name: folder.name,
    shareUuid: folder.shareUuid,
    sizeBytes: folder.sizeBytes,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
    deletedAt: folder.deletedAt,
    originalParentFolderId: folder.originalParentFolderPublicId ?? null,
  };
}

/**
 * GET /api/folders/all
 * Flat list semua folder aktif — dipakai picker Pindah/Salin agar 1 request = semua folder.
 * Harus di atas route param ":" agar tidak tertabrak.
 */
folderRoutes.get("/all", async (c) => {
  const repository = new FolderRepository(c.env.DB);
  const folders = await repository.listAllActive();
  return c.json({ success: true, data: { folders: folders.map(toPublicFolder) } });
});

/**
 * GET /api/folders
 * Lists folders under a parent — accepts ?parentFolderId=<id> (internal use only).
 * Frontend should prefer /api/folders/resolve for human-readable navigation.
 * Hanya menampilkan folder yang TIDAK di-trash (deleted_at IS NULL).
 * Dual-mode: accepts fld_xxx or numeric legacy
 */
folderRoutes.get("/", async (c) => {
  const parentFolderIdParam = c.req.query("parentFolderId");
  const repository = new FolderRepository(c.env.DB);
  let parentFolderId: number | null = null;

  if (parentFolderIdParam) {
    if (typeof parentFolderIdParam === "string" && parentFolderIdParam.startsWith("fld_")) {
      const parent = await repository.findByPublicId(parentFolderIdParam);
      parentFolderId = parent ? parent.id : null;
      // If not found and looks numeric string, fallback
      if (parentFolderId === null) {
        const num = Number(parentFolderIdParam);
        if (!isNaN(num)) parentFolderId = num;
      }
    } else {
      const num = Number(parentFolderIdParam);
      parentFolderId = isNaN(num) ? null : num;
      // Also try public_id lookup if numeric parse failed but string provided
      if (parentFolderId === null) {
        const byPub = await repository.findByPublicId(parentFolderIdParam);
        if (byPub) parentFolderId = byPub.id;
      }
    }
  }

  const folders = await repository.findByParent(parentFolderId);
  return c.json({ success: true, data: { folders: folders.map(toPublicFolder) } });
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
      data: { folder: null, folderId: null, ancestors: [], children: children.map(toPublicFolder) },
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
      data: { folder: null, folderId: null, ancestors: [], children: children.map(toPublicFolder) },
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
      folder: toPublicFolder(currentFolder),
      folderId: (currentFolder as any).folderId ?? (currentFolder as any).publicId ?? resolved.id,
      folderPublicId: (currentFolder as any).folderId ?? (currentFolder as any).publicId ?? null,
      ancestors: ancestors.map(toPublicFolder),
      children: children.map(toPublicFolder),
    },
  });
});

/**
 * GET /api/folders/:id/ancestors
 * Returns the ancestor chain for a given folder ID, root → direct parent.
 * Dual-mode: accepts fld_xxx or numeric
 */
folderRoutes.get("/:id/ancestors", async (c) => {
  const rawId = c.req.param("id");
  const repository = new FolderRepository(c.env.DB);
  const folder = await (repository as any).findByPublicIdOrId(rawId) as any;
  if (!folder) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Folder tidak ditemukan." } }, 404);
  }
  const ancestors = await repository.getAncestors(folder.id);
  return c.json({ success: true, data: { folder: toPublicFolder(folder), ancestors: ancestors.map(toPublicFolder) } });
});

folderRoutes.post("/:id/share", async (c) => {
  const rawId = c.req.param("id");
  const repository = new FolderRepository(c.env.DB);
  const folder = await (repository as any).findByPublicIdOrId(rawId) as any;
  if (!folder) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Folder tidak ditemukan." } }, 404);
  }
  const uuid = uuidv4();
  await repository.setPublic(folder.id, uuid);
  writeAuditLog(c, { action: "folder.share", status: "success", detail: folder.name });
  return c.json({
    success: true,
    data: { shareUuid: uuid, pageUrl: `/folder/${uuid}/${encodeURIComponent(folder.name)}` },
  });
});

folderRoutes.delete("/:id/share", async (c) => {
  const rawId = c.req.param("id");
  const repository = new FolderRepository(c.env.DB);
  const folder = await (repository as any).findByPublicIdOrId(rawId) as any;
  if (!folder) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Folder tidak ditemukan." } }, 404);
  }
  await repository.setPrivate(folder.id);
  writeAuditLog(c, { action: "folder.unshare", status: "success", detail: folder.name });
  return c.json({ success: true, data: { message: "Folder tidak lagi dibagikan publik." } });
});
folderRoutes.get("/:id", async (c) => {
  const rawId = c.req.param("id");
  const repository = new FolderRepository(c.env.DB);
  const folder = await (repository as any).findByPublicIdOrId(rawId) as any;
  if (!folder) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Folder tidak ditemukan." } }, 404);
  }
  return c.json({ success: true, data: { folder: toPublicFolder(folder) } });
});

folderRoutes.post("/", zValidator("json", createFolderSchema), async (c) => {
  const input = c.req.valid("json") as any;
  const repository = new FolderRepository(c.env.DB);
  let parentFolderId: number | null = null;
  const rawParent = input.parentFolderId;
  if (rawParent !== undefined && rawParent !== null) {
    if (typeof rawParent === "string" && rawParent.startsWith("fld_")) {
      const parent = await repository.findByPublicId(rawParent);
      parentFolderId = parent ? parent.id : null;
    } else if (typeof rawParent === "number") {
      parentFolderId = rawParent;
    } else if (typeof rawParent === "string" && /^\d+$/.test(rawParent)) {
      parentFolderId = Number(rawParent);
    } else if (typeof rawParent === "string") {
      const parent = await repository.findByPublicId(rawParent);
      if (parent) parentFolderId = parent.id;
      else {
        const num = Number(rawParent);
        if (!isNaN(num)) parentFolderId = num;
      }
    }
  }

  const folder = await repository.create({
    name: input.name,
    parentFolderId,
  });

  writeAuditLog(c, { action: "folder.create", status: "success", detail: input.name });
  return c.json({ success: true, data: { folder: toPublicFolder(folder) } }, 201);
});

folderRoutes.patch("/:id", zValidator("json", renameFolderSchema), async (c) => {
  const rawId = c.req.param("id");
  const { name } = c.req.valid("json");
  const repository = new FolderRepository(c.env.DB);
  const existing = await (repository as any).findByPublicIdOrId(rawId) as any;
  if (!existing) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Folder tidak ditemukan." } }, 404);
  }
  await repository.rename(existing.id, name);
  writeAuditLog(c, { action: "folder.rename", status: "success", detail: name });
  return c.json({ success: true, data: { message: "Folder berhasil diganti nama." } });
});

/**
 * DELETE /api/folders/:id
 * Memindahkan folder ke Trash (soft delete).
 * - Folder itu sendiri + semua sub-folder ikut di-soft-delete
 * - Semua file di dalam folder (termasuk sub-folder) ikut di-soft-delete
 * - File public otomatis diubah ke private
 * Dual-mode: fld_xxx or numeric
 */
folderRoutes.delete("/:id", async (c) => {
  const rawId = c.req.param("id");
  const folderRepository = new FolderRepository(c.env.DB);
  const fileRepository = new FileRepository(c.env.DB);

  const existing = await (folderRepository as any).findByPublicIdOrId(rawId) as any;
  if (!existing) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Folder tidak ditemukan." } }, 404);
  }

  const id = existing.id;

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
