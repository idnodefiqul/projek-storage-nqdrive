import { Hono } from "hono";
import { requireAuth } from "../middleware/require-auth.middleware";
import { UploadService, UploadValidationError, NoStorageAvailableError } from "../services/upload.service";
import type { Env } from "../config/env";

const uploadRoutes = new Hono<{ Bindings: Env }>();

uploadRoutes.use("*", requireAuth);

/**
 * POST /api/files/upload
 * Expects raw file body with metadata via headers.
 *
 * Required headers:
 *   X-Filename   - original filename (URL-encoded)
 *   X-File-Size  - total size in bytes
 *   Content-Type - file's mime type
 *   X-Folder-Id  - optional, target folder id
 *   X-File-SHA256      - optional, SHA-256 hex checksum (64 chars, computed by browser)
 */
uploadRoutes.post("/upload", async (c) => {
  const filenameHeader = c.req.header("X-Filename");
  const sizeHeader = c.req.header("X-File-Size");
  const folderIdHeader = c.req.header("X-Folder-Id");

  const mimeType = c.req.header("Content-Type");
  if (!mimeType) {
    return c.json(
      { success: false, error: { code: "MISSING_HEADERS", message: "Content-Type wajib disertakan." } },
      400
    );
  }

  const mimeTypeClean = mimeType.split(";")[0]?.trim() ?? mimeType;

  if (!filenameHeader || !sizeHeader) {
    return c.json(
      { success: false, error: { code: "MISSING_HEADERS", message: "X-Filename dan X-File-Size wajib disertakan." } },
      400
    );
  }

  let filename: string;
  try {
    filename = decodeURIComponent(filenameHeader);
  } catch {
    return c.json(
      { success: false, error: { code: "INVALID_FILENAME", message: "X-Filename tidak valid (encoding error)." } },
      400
    );
  }

  const sizeBytes = Number(sizeHeader);

  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    return c.json(
      { success: false, error: { code: "INVALID_SIZE", message: "X-File-Size harus berupa angka bulat positif." } },
      400
    );
  }

  const folderId = folderIdHeader ? Number(folderIdHeader) : null;

  if (folderIdHeader !== undefined && folderIdHeader !== null && (!Number.isInteger(folderId) || (folderId as number) <= 0)) {
    return c.json(
      { success: false, error: { code: "INVALID_FOLDER_ID", message: "X-Folder-Id tidak valid." } },
      400
    );
  }

  if (!c.req.raw.body) {
    return c.json({ success: false, error: { code: "EMPTY_BODY", message: "Request tidak memiliki isi file." } }, 400);
  }

  const sha256Header = c.req.header("X-File-SHA256");
  let sha256Hash: string | null = null;
  if (sha256Header) {
    if (!/^[a-fA-F0-9]{64}$/.test(sha256Header)) {
      return c.json(
        { success: false, error: { code: "INVALID_SHA256", message: "X-File-SHA256 harus berupa 64 karakter hex." } },
        400
      );
    }
    sha256Hash = sha256Header.toLowerCase();
  }

  const uploadService = new UploadService(c.env);

  try {
    const file = await uploadService.uploadFile({
      filename,
      mimeType: mimeTypeClean,
      sizeBytes,
      folderId,
      stream: c.req.raw.body,
      sha256Hash,
    });

    return c.json({ success: true, data: { file } }, 201);
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return c.json({ success: false, error: { code: "VALIDATION_FAILED", message: error.message } }, 422);
    }
    if (error instanceof NoStorageAvailableError) {
      return c.json({ success: false, error: { code: "NO_STORAGE_AVAILABLE", message: error.message } }, 507);
    }
    throw error;
  }
});

export { uploadRoutes };
