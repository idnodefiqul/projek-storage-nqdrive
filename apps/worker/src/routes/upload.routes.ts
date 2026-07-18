import { Hono } from "hono";
import { requireAuth } from "../middleware/require-auth.middleware";
import { UploadService, UploadValidationError, NoStorageAvailableError } from "../services/upload.service";
import { StorageAllocationService } from "../services/storage-allocation.service";
import { GoogleAccountConnectionService } from "../services/google-account-connection.service";
import { resolveCredentials } from "../utils/credentials";
import { DriveAccountRepository } from "../database/drive-account.repository";
import { accountHasSpaceFor } from "@nqdrive/storage";
import type { Env } from "../config/env";
import { writeAuditLog } from "../utils/audit";

const uploadRoutes = new Hono<{ Bindings: Env }>();

const DROPBOX_CONTENT_BASE = "https://content.dropboxapi.com/2";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/** Parse "bytes {start}-{endInclusive}/{total}" → { start, endExclusive, total }. */
function parseContentRange(value: string | undefined): { start: number; endExclusive: number; total: number } | null {
  if (!value) return null;
  const match = value.match(/bytes\s+(\d+)-(\d+)\/(\d+)/i);
  if (!match) return null;
  const start = Number(match[1]);
  const endInclusive = Number(match[2]);
  const total = Number(match[3]);
  return { start, endExclusive: endInclusive + 1, total };
}

uploadRoutes.use("*", requireAuth);

/**
 * POST /api/upload/session
 * Membuat resumable upload session dan mengembalikan sessionId LOKAL.
 * Endpoint cerdas: mendeteksi provider akun tujuan (Google Drive / Dropbox) dan
 * menyiapkan session yang sesuai. Browser tidak pernah melihat URL provider.
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
    // Dual-mode: acc_xxx or numeric
    if (targetAccountIdHeader.startsWith("acc_")) {
      account = await (accountRepo as any).findByPublicId(targetAccountIdHeader);
    } else {
      const num = Number(targetAccountIdHeader);
      if (!isNaN(num)) account = await accountRepo.findById(num);
      else account = await (accountRepo as any).findByPublicId(targetAccountIdHeader);
    }

    // Guard: akun yang dipilih manual harus punya ruang cukup (termasuk cadangan
    // per-provider — Dropbox sisakan 300 MB). Cegah upload melebihi kuota.
    if (account && !accountHasSpaceFor(account, sizeBytes)) {
      return c.json(
        {
          success: false,
          error: {
            code: "INSUFFICIENT_SPACE",
            message: "Ruang akun tujuan tidak cukup untuk file ini (termasuk cadangan minimum).",
          },
        },
        507
      );
    }
  }

  if (!account) {
    const allocationService = new StorageAllocationService(c.env.DB);
    account = await allocationService.pickAccountForUpload(sizeBytes);
  }

  if (!account) {
    return c.json({ success: false, error: { code: "NO_STORAGE_AVAILABLE", message: "No storage available." } }, 507);
  }

  const sessionId = crypto.randomUUID();

  if (account.provider === "dropbox") {
    // Dropbox: mulai upload session kosong, simpan session_id sebagai "upload url".
    const credentials = await resolveCredentials(account, c.env);
    const startRes = await fetch(`${DROPBOX_CONTENT_BASE}/files/upload_session/start`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({ close: false }),
      },
      body: new Uint8Array(0),
    });
    if (!startRes.ok) {
      return c.json({ success: false, error: { code: "DROPBOX_API_ERROR", message: "Failed to initiate session." } }, 500);
    }
    const { session_id: dropboxSessionId } = (await startRes.json()) as { session_id: string };

    await c.env.DB.prepare(
      `INSERT INTO upload_sessions (id, google_upload_url, provider, drive_account_id, filename, mime_type, size_bytes)
       VALUES (?, ?, 'dropbox', ?, ?, ?, ?)`
    ).bind(sessionId, dropboxSessionId, account.id, decodedFilename, mimeType, sizeBytes).run();

    const accPubId = (account as any).accountId ?? (account as any).publicId ?? String(account.id);
    return c.json({ success: true, data: { sessionId, accountId: accPubId, provider: account.provider } }, 200);
  }

  if (account.provider === "onedrive") {
    const credentials = await resolveCredentials(account, c.env);
    const path = encodeURIComponent(decodedFilename);
    const sessionRes = await fetch(`${GRAPH_BASE}/me/drive/root:/${path}:/createUploadSession`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        item: { "@microsoft.graph.conflictBehavior": "rename", name: decodedFilename },
      }),
    });
    if (!sessionRes.ok) {
      return c.json({ success: false, error: { code: "ONEDRIVE_API_ERROR", message: "Failed to create upload session." } }, 500);
    }
    const { uploadUrl } = (await sessionRes.json()) as { uploadUrl: string };

    await c.env.DB.prepare(
      `INSERT INTO upload_sessions (id, google_upload_url, provider, drive_account_id, filename, mime_type, size_bytes)
       VALUES (?, ?, 'onedrive', ?, ?, ?, ?)`
    ).bind(sessionId, uploadUrl, account.id, decodedFilename, mimeType, sizeBytes).run();

    const accPubIdOne = (account as any).accountId ?? (account as any).publicId ?? String(account.id);
    return c.json({ success: true, data: { sessionId, accountId: accPubIdOne, provider: account.provider } }, 200);
  }

  // Google Drive (default)
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

  await c.env.DB.prepare(
    `INSERT INTO upload_sessions (id, google_upload_url, provider, drive_account_id, filename, mime_type, size_bytes)
     VALUES (?, ?, 'google_drive', ?, ?, ?, ?)`
  ).bind(sessionId, googleUploadUrl, account.id, decodedFilename, mimeType, sizeBytes).run();

  const accPubIdG = (account as any).accountId ?? (account as any).publicId ?? String(account.id);
  return c.json({ success: true, data: { sessionId, accountId: accPubIdG, provider: account.provider } }, 200);
});

/**
 * PUT /api/upload/status/:sessionId
 * Meneruskan satu chunk ke provider yang sesuai. Browser mengirim chunk ke sini
 * dengan header Content-Range; worker meneruskan ke Google atau Dropbox.
 * Kembalikan 308 jika masih ada chunk, 200/201 + providerFileId saat selesai.
 */
uploadRoutes.put("/status/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const session = await c.env.DB.prepare(
    "SELECT google_upload_url, provider, drive_account_id, filename, mime_type, size_bytes FROM upload_sessions WHERE id = ?"
  ).bind(sessionId).first<{ google_upload_url: string; provider: string; drive_account_id: number; filename: string; mime_type: string; size_bytes: number }>();

  if (!session) {
    return c.json({ success: false, error: { code: "SESSION_NOT_FOUND", message: "Upload session expired or invalid." } }, 404);
  }

  const contentRange = c.req.header("Content-Range");
  const contentLength = c.req.header("Content-Length");
  const body = c.req.raw.body;

  if (!body) {
    return c.json({ success: false, error: { code: "EMPTY_BODY", message: "No chunk data." } }, 400);
  }

  // ── Dropbox ────────────────────────────────────────────────────────────────
  if (session.provider === "dropbox") {
    const range = parseContentRange(contentRange);
    const offset = range?.start ?? 0;
    const total = range?.total ?? session.size_bytes;
    const endExclusive = range?.endExclusive ?? total;
    // Chunk terakhir: end mencapai total (atau file kosong).
    const isLast = total === 0 || endExclusive >= total;

    const accountRepo = new DriveAccountRepository(c.env.DB);
    const account = await accountRepo.findById(session.drive_account_id);
    if (!account) {
      return c.json({ success: false, error: { code: "SESSION_NOT_FOUND", message: "Account gone." } }, 404);
    }
    const credentials = await resolveCredentials(account, c.env);

    if (!isLast) {
      const appendRes = await fetch(`${DROPBOX_CONTENT_BASE}/files/upload_session/append_v2`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": "application/octet-stream",
          ...(contentLength ? { "Content-Length": contentLength } : {}),
          "Dropbox-API-Arg": JSON.stringify({
            cursor: { session_id: session.google_upload_url, offset },
            close: false,
          }),
        },
        // @ts-ignore CF Workers streaming body
        body,
        duplex: "half",
      } as any);
      if (!appendRes.ok) {
        const errText = await appendRes.text().catch(() => "Unknown error");
        return c.json({ success: false, error: { code: "DROPBOX_UPLOAD_ERROR", message: errText } }, 500);
      }
      return new Response(null, { status: 308 });
    }

    // Chunk terakhir: finish + commit ke path final.
    const finishRes = await fetch(`${DROPBOX_CONTENT_BASE}/files/upload_session/finish`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/octet-stream",
        ...(contentLength ? { "Content-Length": contentLength } : {}),
        "Dropbox-API-Arg": JSON.stringify({
          cursor: { session_id: session.google_upload_url, offset },
          commit: { path: `/${session.filename}`, mode: "add", autorename: true, mute: true },
        }),
      },
      // @ts-ignore CF Workers streaming body
      body,
      duplex: "half",
    } as any);

    if (!finishRes.ok) {
      const errText = await finishRes.text().catch(() => "Unknown error");
      return c.json({ success: false, error: { code: "DROPBOX_UPLOAD_ERROR", message: errText } }, 500);
    }
    const data = (await finishRes.json()) as { id: string };
    await c.env.DB.prepare("DELETE FROM upload_sessions WHERE id = ?").bind(sessionId).run();
    return c.json({ success: true, data: { providerFileId: data.id } });
  }

  // ── OneDrive ─────────────────────────────────────────────────────────────────
  if (session.provider === "onedrive") {
    const range = parseContentRange(contentRange);
    const start = range?.start ?? 0;
    const end = range?.endExclusive ?? session.size_bytes;
    const total = range?.total ?? session.size_bytes;
    const isLast = total === 0 || end >= total;

    const headers: Record<string, string> = {};
    if (contentRange) headers["Content-Range"] = contentRange;
    if (contentLength) headers["Content-Length"] = contentLength;

    const odRes = await fetch(session.google_upload_url, {
      method: "PUT",
      headers,
      // @ts-ignore CF Workers streaming body
      body,
      duplex: "half",
    } as any);

    if (odRes.status === 202) {
      return new Response(null, { status: 308 });
    }

    if (odRes.status === 200 || odRes.status === 201) {
      const data = (await odRes.json()) as { id: string };
      await c.env.DB.prepare("DELETE FROM upload_sessions WHERE id = ?").bind(sessionId).run();
      return c.json({ success: true, data: { providerFileId: data.id } });
    }

    const errText = await odRes.text().catch(() => "Unknown error");
    return c.json({ success: false, error: { code: "ONEDRIVE_UPLOAD_ERROR", message: errText } }, (odRes.status || 500) as 500);
  }

  // ── Google Drive (default) ──────────────────────────────────────────────────
  const headers: Record<string, string> = {};
  if (contentRange) headers["Content-Range"] = contentRange;
  if (contentLength) headers["Content-Length"] = contentLength;

  const googleRes = await fetch(session.google_upload_url, {
    method: "PUT",
    headers,
    // @ts-ignore Cloudflare Workers supports streaming ReadableStream as body
    body,
    duplex: "half",
  } as any);

  // 308 = more chunks needed, 200/201 = upload complete
  if (googleRes.status === 308) {
    return new Response(null, { status: 308 });
  }

  if (googleRes.status === 200 || googleRes.status === 201) {
    const data = await googleRes.json();
    await c.env.DB.prepare("DELETE FROM upload_sessions WHERE id = ?").bind(sessionId).run();
    return c.json({ success: true, data: { providerFileId: (data as any).id } });
  }

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