import { Hono } from "hono";
import { requireAuth } from "../middleware/require-auth.middleware";
import { UploadService, UploadValidationError, NoStorageAvailableError } from "../services/upload.service";
import { StorageAllocationService } from "../services/storage-allocation.service";
import { GoogleAccountConnectionService } from "../services/google-account-connection.service";
import { DriveAccountRepository } from "../database/drive-account.repository";
import type { Env } from "../config/env";
import { writeAuditLog } from "../utils/audit";

const uploadRoutes = new Hono<{ Bindings: Env }>();

uploadRoutes.use("*", requireAuth);

/**
 * POST /api/upload/session
 * Creates a Google Drive resumable upload session and returns a LOCAL sessionId.
 * The browser NEVER sees the googleapis.com URL.
 */
uploadRoutes.post("/session", async (c) => {
  const filename = c.req.header("X-Filename");
  const sizeBytes = Number(c.req.header("X-File-Size"));
  const mimeType = c.req.header("Content-Type");
  const targetAccountIdHeader = c.req.header("X-Target-Account-Id");

  if (!filename || !sizeBytes || !mimeType) {
    return c.json({ success: false, error: { code: "MISSING_HEADERS", message: "Missing required headers." } }, 400);
  }

  let account: any = null;
  const decodedFilename = decodeURIComponent(filename);

  if (targetAccountIdHeader) {
    const accountRepo = new DriveAccountRepository(c.env.DB);
    account = await accountRepo.findById(Number(targetAccountIdHeader));
  }

  if (!account) {
    const allocationService = new StorageAllocationService(c.env.DB);
    account = await allocationService.pickAccountForUpload(sizeBytes);
  }

  if (!account) {
    return c.json({ success: false, error: { code: "NO_STORAGE_AVAILABLE", message: "No storage available." } }, 507);
  }

  const connectionService = new GoogleAccountConnectionService(c.env);
  const accessToken = await connectionService.getValidAccessToken(account);

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

  const googleUploadUrl = sessionResponse.headers.get("Location");
  if (!googleUploadUrl) {
    return c.json({ success: false, error: { code: "GOOGLE_API_ERROR", message: "No upload URL." } }, 500);
  }

  // Generate local session ID — browser will use this instead of Google URL
  const sessionId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO upload_sessions (id, google_upload_url, drive_account_id, filename, mime_type, size_bytes)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(sessionId, googleUploadUrl, account.id, decodedFilename, mimeType, sizeBytes).run();

  return c.json({ success: true, data: { sessionId, accountId: account.id, provider: account.provider } }, 200);
});

/**
 * PUT /api/upload/status/:sessionId
 * Proxies a chunk upload to Google Drive. Browser sends chunk here,
 * worker forwards to Google. No googleapis.com exposure to browser.
 */
uploadRoutes.put("/status/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const session = await c.env.DB.prepare(
    "SELECT google_upload_url, drive_account_id, filename, mime_type, size_bytes FROM upload_sessions WHERE id = ?"
  ).bind(sessionId).first<{ google_upload_url: string; drive_account_id: number; filename: string; mime_type: string; size_bytes: number }>();

  if (!session) {
    return c.json({ success: false, error: { code: "SESSION_NOT_FOUND", message: "Upload session expired or invalid." } }, 404);
  }

  const contentRange = c.req.header("Content-Range");
  const body = c.req.raw.body;

  if (!body) {
    return c.json({ success: false, error: { code: "EMPTY_BODY", message: "No chunk data." } }, 400);
  }

  // Stream chunk directly to Google Drive (no buffering)
  const headers: Record<string, string> = {};
  if (contentRange) headers["Content-Range"] = contentRange;
  const contentLength = c.req.header("Content-Length");
  if (contentLength) headers["Content-Length"] = contentLength;

  const googleRes = await fetch(session.google_upload_url, {
    method: "PUT",
    headers,
    // @ts-ignore ? Cloudflare Workers supports streaming ReadableStream as body
    body,
    duplex: "half",
  } as any);

  // 308 = more chunks needed, 200/201 = upload complete
  if (googleRes.status === 308) {
    return new Response(null, { status: 308 });
  }

  if (googleRes.status === 200 || googleRes.status === 201) {
    // Upload complete — return Google file metadata
    const data = await googleRes.json();
    // Clean up session
    await c.env.DB.prepare("DELETE FROM upload_sessions WHERE id = ?").bind(sessionId).run();
    return c.json({ success: true, data: { providerFileId: (data as any).id } });
  }

  // Error from Google
  const errText = await googleRes.text().catch(() => "Unknown error");
  return c.json({ success: false, error: { code: "GOOGLE_UPLOAD_ERROR", message: errText } }, (googleRes.status || 500) as 500);
});

/**
 * POST /api/upload/finalize
 * Saves file metadata to DB after upload is complete.
 */
uploadRoutes.post("/finalize", async (c) => {
  const body = await c.req.json();
  const { providerFileId, accountId, filename, mimeType, sizeBytes, folderId } = body;

  const uploadService = new UploadService(c.env);
  try {
    const file = await uploadService.finalizeUpload({
      providerFileId,
      accountId,
      filename,
      mimeType,
      sizeBytes,
      folderId,
    });
    writeAuditLog(c, { action: "file.upload", status: "success", detail: filename });
    return c.json({ success: true, data: { file } }, 201);
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return c.json({ success: false, error: { code: "VALIDATION_FAILED", message: error.message } }, 422);
    }
    console.error("[upload/finalize] unexpected error:", error);
    throw error;
  }
});

export { uploadRoutes };