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
 * Frontend should prefer /api/folders/by-path for human-readable navigation.
 */
folderRoutes.get("/", async (c) => {
  const parentFolderIdParam = c.req.query("parentFolderId");
  const parentFolderId = parentFolderIdParam ? Number(parentFolderIdParam) : null;

  const repository = new FolderRepository(c.env.DB);
  const folders = await repository.findByParent(parentFolderId);

  return c.json({ success: true, data: { folders } });
});

/**
 * GET /api/folders/by-path?path=Dokumen/Proyek/2025
 * Resolves a human-readable slash-separated path to folder metadata + children.
 * This is the canonical way the frontend navigates nested folders without exposing IDs.
 *
 * Response includes:
 *   - folder: the resolved folder (null if path is empty = root)
 *   - ancestors: ordered list [root → ... → direct parent] for breadcrumb rendering
 *   - children: sub-folders inside the resolved folder
 *   - folderId: the resolved integer ID (for internal API calls like /api/files)
 */
folderRoutes.get("/by-path", async (c) => {
  const rawPath = c.req.query("path") ?? "";
  const repository = new FolderRepository(c.env.DB);

  // Empty path = root
  if (!rawPath || rawPath === "/") {
    const children = await repository.findByParent(null);
    return c.json({
      success: true,
      data: { folder: null, folderId: null, ancestors: [], children },
    });
  }

  // Split and decode each segment
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
  // ancestors for breadcrumb = all except the last (which is the current folder)
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
 * Used internally when a direct-ID navigation is needed (e.g. after creating a folder).
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
