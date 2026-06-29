import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { createFolderSchema } from "@nqdrive/api";
import { z } from "zod";
import { requireAuth } from "../middleware/require-auth.middleware";
import { FolderRepository } from "../database/folder.repository";
import type { Env } from "../config/env";

const folderRoutes = new Hono<{ Bindings: Env }>();

folderRoutes.use("*", requireAuth);

const renameFolderSchema = z.object({ name: z.string().min(1).max(255) });

/**
 * GET /api/folders
 * Lists folders under a parent — accepts ?parentFolderId=<id> (internal use only).
 * Frontend should prefer /api/folders/resolve for human-readable navigation.
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
 *
 * Format path: nama folder dipisahkan dengan "/" — setiap segment sudah
 * di-decode oleh backend secara individual (encodeURIComponent per segment
 * dari frontend, bukan encode keseluruhan string).
 *
 * Response:
 *   - folder: folder yang di-resolve (null jika path kosong = root)
 *   - ancestors: ordered list [root → ... → direct parent] untuk breadcrumb
 *   - children: sub-folder di dalam folder yang di-resolve
 *   - folderId: integer ID yang di-resolve (untuk /api/files call)
 */
folderRoutes.get("/resolve", async (c) => {
  // Baca dari query param "folder" — fallback ke "path" untuk backward-compat
  // selama masa transisi (hapus fallback setelah semua client sudah update).
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

  // Split per "/" dan decode setiap segment secara individual.
  // Frontend mengirim: encodeURIComponent(segment).join("/")
  // Jadi "Windows/11" diterima sebagai "Windows/11" (/ literal),
  // "Folder Saya/Sub Folder" diterima sebagai "Folder%20Saya/Sub%20Folder"
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
  return c.json({ success: true, data: { message: "Folder berhasil diganti nama." } });
});

/** DELETE /api/folders/:id — cascades to sub-folders automatically (FK ON DELETE CASCADE). */
folderRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const repository = new FolderRepository(c.env.DB);

  const existing = await repository.findById(id);
  if (!existing) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Folder tidak ditemukan." } }, 404);
  }

  await repository.delete(id);
  return c.json({ success: true, data: { message: "Folder berhasil dihapus." } });
});

export { folderRoutes };
