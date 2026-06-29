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

/** GET /api/folders?parentFolderId=123 — lists folders under a parent (or root if omitted). */
folderRoutes.get("/", async (c) => {
  const parentFolderIdParam = c.req.query("parentFolderId");
  const parentFolderId = parentFolderIdParam ? Number(parentFolderIdParam) : null;

  const repository = new FolderRepository(c.env.DB);
  const folders = await repository.findByParent(parentFolderId);

  return c.json({ success: true, data: { folders } });
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
