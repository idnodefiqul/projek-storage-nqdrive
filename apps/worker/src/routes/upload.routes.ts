import { Hono } from "hono";
import { requireAuth } from "../middleware/require-auth.middleware";
import { UploadService, UploadValidationError, NoStorageAvailableError } from "../services/upload.service";
import { StorageAllocationService } from "../services/storage-allocation.service";
import { GoogleAccountConnectionService } from "../services/google-account-connection.service";
import type { Env } from "../config/env";
import { StorageProviderFactory } from "@nqdrive/storage";

const uploadRoutes = new Hono<{ Bindings: Env }>();

uploadRoutes.use("*", requireAuth);

uploadRoutes.post("/session", async (c) => {
  const filename = c.req.header("X-Filename");
  const sizeBytes = Number(c.req.header("X-File-Size"));
  const mimeType = c.req.header("Content-Type");

  if (!filename || !sizeBytes || !mimeType) {
    return c.json({ success: false, error: { code: "MISSING_HEADERS", message: "Missing required headers." } }, 400);
  }
  
  const allocationService = new StorageAllocationService(c.env.DB);
  const account = await allocationService.pickAccountForUpload(sizeBytes);
  if (!account) {
    return c.json({ success: false, error: { code: "NO_STORAGE_AVAILABLE", message: "No storage available." } }, 507);
  }
  
  const connectionService = new GoogleAccountConnectionService(c.env);
  const accessToken = await connectionService.getValidAccessToken(account);

  const decodedFilename = decodeURIComponent(filename);

  const sessionResponse = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Upload-Content-Type": mimeType,
      "X-Upload-Content-Length": String(sizeBytes),
    },
    body: JSON.stringify({ name: decodedFilename }),
  });

  if (!sessionResponse.ok) {
    return c.json({ success: false, error: { code: "GOOGLE_API_ERROR", message: "Failed to initiate session." } }, 500);
  }

  const uploadUrl = sessionResponse.headers.get("Location");
  if (!uploadUrl) {
    return c.json({ success: false, error: { code: "GOOGLE_API_ERROR", message: "No upload URL." } }, 500);
  }

  return c.json({ success: true, data: { uploadUrl, accountId: account.id } }, 200);
});

uploadRoutes.post("/finalize", async (c) => {
  const body = await c.req.json();
  const { providerFileId, accountId, filename, mimeType, sizeBytes, folderId, sha256Hash } = body;
  
  const uploadService = new UploadService(c.env);
  try {
    const file = await uploadService.finalizeUpload({
      providerFileId,
      accountId,
      filename,
      mimeType,
      sizeBytes,
      folderId,
      sha256Hash,
    });
    return c.json({ success: true, data: { file } }, 201);
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return c.json({ success: false, error: { code: "VALIDATION_FAILED", message: error.message } }, 422);
    }
    throw error;
  }
});


export { uploadRoutes };
