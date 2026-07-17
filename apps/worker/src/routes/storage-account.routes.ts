import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { requireAuth } from "../middleware/require-auth.middleware";
import { DriveAccountRepository } from "../database/drive-account.repository";
import { FileRepository } from "../database/file.repository";
import { GoogleAccountConnectionService } from "../services/google-account-connection.service";
import { DropboxAccountConnectionService } from "../services/dropbox-account-connection.service";
import { OneDriveAccountConnectionService } from "../services/onedrive-account-connection.service";
import {
  exchangeRefreshToken,
  fetchGoogleAccountInfo,
  buildGoogleAuthUrl,
} from "../services/google-oauth.service";
import { buildDropboxAuthUrl } from "../services/dropbox-oauth.service";
import { buildOneDriveAuthUrl } from "../services/onedrive-oauth.service";
import { signJwt, verifyJwt } from "../utils/jwt";
import { calculatePercentage } from "@nqdrive/shared";
import { StorageProviderFactory } from "@nqdrive/storage";
import { writeAuditLog } from "../utils/audit";
import { resolveCredentials } from "../utils/credentials";
import type { Env } from "../config/env";
import type { PublicDriveAccount, DriveAccount } from "@nqdrive/types";

const storageAccountRoutes = new Hono<{ Bindings: Env }>();

// Redirect URI OAuth harus menunjuk ke worker (yang memegang CLIENT_SECRET),
// dan HARUS sama persis dengan yang didaftarkan di console masing-masing provider.
function getRedirectUri(env: Env): string {
  // Semua provider pakai callback yang sama, biar redirect_uri konsisten
  return `${env.GOOGLE_OAUTH_REDIRECT_URI.replace(/\/$/, "")}/api/storage/accounts/oauth/callback`;
}

// URL dashboard tujuan redirect balik setelah callback (sukses/gagal) — unified STORAGE
function getDashboardUrl(env: Env, _provider: string = "google_drive"): string {
  const base = (env.WEB_APP_URL || "https://drive.fiqul.id").replace(/\/$/, "");
  return `${base}/dashboard/storage`;
}

// ─── OAuth callback (multi-provider) — TANPA requireAuth ──────────
// Didaftarkan SEBELUM requireAuth agar provider OAuth (yang tak punya cookie sesi) bisa mengaksesnya.
// Proteksi CSRF via `state` JWT bertanda-tangan yang kita terbitkan di /oauth/url.
// Provider disimpan di field username dalam JWT state.
storageAccountRoutes.get("/accounts/oauth/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const oauthError = c.req.query("error");
  const errorDesc = c.req.query("error_description");

  // Validasi state dulu untuk dapat provider, baru tentukan dashboard redirect
  let provider = "google_drive";
  let dashboard = getDashboardUrl(c.env, provider);

  if (state) {
    try {
      const payload = await verifyJwt(state, c.env.JWT_SECRET);
      if (payload && payload.email === "oauth-state@nqdrive.internal") {
        const p = (payload as any).username || "google_drive";
        // username berisi provider, kecuali "oauth" legacy
        if (["google_drive", "dropbox", "onedrive"].includes(p)) {
          provider = p;
        }
        dashboard = getDashboardUrl(c.env, provider);
      }
    } catch {
      // ignore, pakai default dashboard
    }
  }

  if (oauthError) {
    return c.redirect(`${dashboard}?oauth=error&reason=${encodeURIComponent(oauthError)}&desc=${encodeURIComponent(errorDesc || "")}`);
  }
  if (!code || !state) {
    return c.redirect(`${dashboard}?oauth=error&reason=missing_code`);
  }

  const statePayload = await verifyJwt(state, c.env.JWT_SECRET);
  if (!statePayload || statePayload.email !== "oauth-state@nqdrive.internal") {
    return c.redirect(`${dashboard}?oauth=error&reason=invalid_state`);
  }

  // Ambil provider dari username field di JWT
  const stateProvider = (statePayload as any).username as string;
  if (["google_drive", "dropbox", "onedrive"].includes(stateProvider)) {
    provider = stateProvider;
    dashboard = getDashboardUrl(c.env, provider);
  }

  try {
    let account: DriveAccount;
    const redirectUri = getRedirectUri(c.env);

    switch (provider) {
      case "dropbox": {
        const svc = new DropboxAccountConnectionService(c.env);
        account = await svc.connectViaAuthCode(code, redirectUri);
        break;
      }
      case "onedrive": {
        const svc = new OneDriveAccountConnectionService(c.env);
        account = await svc.connectViaAuthCode(code, redirectUri);
        break;
      }
      case "google_drive":
      default: {
        const svc = new GoogleAccountConnectionService(c.env);
        account = await svc.connectViaAuthCode(code, redirectUri);
        break;
      }
    }

    return c.redirect(`${dashboard}?oauth=success&email=${encodeURIComponent(account.email)}&provider=${encodeURIComponent(provider)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "connect_failed";
    return c.redirect(`${dashboard}?oauth=error&reason=${encodeURIComponent(message)}&provider=${encodeURIComponent(provider)}`);
  }
});

storageAccountRoutes.use("*", requireAuth);

// ─── GET /api/storage/accounts/oauth/url ───────────────────────────────────
// Admin terautentikasi meminta URL consent (multi-provider). Kita terbitkan `state` JWT
// berumur pendek untuk proteksi CSRF, lalu frontend melakukan window.location ke URL ini.
storageAccountRoutes.get("/accounts/oauth/url", async (c) => {
  const providerParam = (c.req.query("provider") || "google_drive").toString().toLowerCase();
  const provider = ["google_drive", "dropbox", "onedrive"].includes(providerParam) ? providerParam : "google_drive";

  const state = await signJwt(
    { sub: 0, username: provider, email: "oauth-state@nqdrive.internal" } as any,
    c.env.JWT_SECRET,
    600 // 10 menit
  );

  const redirectUri = getRedirectUri(c.env);
  let url: string;

  switch (provider) {
    case "dropbox":
      if (!c.env.DROPBOX_APP_KEY) throw new Error("Dropbox not configured");
      url = buildDropboxAuthUrl({
        clientId: c.env.DROPBOX_APP_KEY!,
        redirectUri,
        state,
      });
      break;
    case "onedrive":
      if (!c.env.MICROSOFT_CLIENT_ID) throw new Error("OneDrive not configured");
      url = buildOneDriveAuthUrl({
        clientId: c.env.MICROSOFT_CLIENT_ID!,
        redirectUri,
        state,
      });
      break;
    case "google_drive":
    default:
      url = buildGoogleAuthUrl({
        clientId: c.env.GOOGLE_CLIENT_ID,
        redirectUri,
        state,
      });
      break;
  }

  return c.json({ success: true, data: { url } });
});

// ─── Helper ───────────────────────────────────────────────────────────────


async function formatDriveAccount(params: {
  env: Env;
  account: DriveAccount;
}): Promise<{ deletedFiles: number }> {
  const { env, account } = params;

  const credentials = await resolveCredentials(account, env);
  const provider = StorageProviderFactory.resolve(account.provider);

  // Hapus SEMUA isi drive langsung di provider (Google Drive asli) — termasuk
  // file lama/orphan yang tidak tercatat di database — lalu kosongkan trash.
  let deletedFromDrive = 0;
  if (provider.deleteAllFiles) {
    const result = await provider.deleteAllFiles({ credentials: credentials as any });
    deletedFromDrive = result.deletedCount;
  } else {
    // Fallback untuk provider tanpa deleteAllFiles: hapus per file yang tercatat di DB.
    const { results: files } = await env.DB.prepare(
      "SELECT id, provider_file_id FROM files WHERE drive_account_id = ?"
    ).bind(account.id).all<{ id: number; provider_file_id: string }>();

    for (const file of files) {
      try {
        await provider.delete({ credentials: credentials as any, providerFileId: file.provider_file_id });
        deletedFromDrive++;
      } catch (err) {
        console.error(`Gagal hapus file ${file.id} dari provider:`, err);
      }
    }
  }

  // Bersihkan seluruh record file akun ini dari database (list file dashboard).
  await env.DB.prepare("DELETE FROM files WHERE drive_account_id = ?").bind(account.id).run();

  // Sinkronkan kuota agar progress bar storage langsung mencerminkan drive kosong.
  try {
    const quota = await provider.getQuota({ credentials: credentials as any });
    const driveAccountRepository = new DriveAccountRepository(env.DB);
    await driveAccountRepository.updateQuota(account.id, quota);
  } catch (err) {
    console.error(`Gagal sync kuota akun ${account.id} setelah format:`, err);
  }

  return { deletedFiles: deletedFromDrive };
}
function toPublic(account: DriveAccount): PublicDriveAccount {
  const {
    refreshTokenEncrypted: _refresh,
    accessToken: _access,
    accessTokenExpiresAt: _expiry,
    ...safe
  } = account;
  return safe;
}

/**
 * Schema validasi input refresh token.
 *
 * FIX Bug 2: Regex diperlonggar agar menerima semua karakter valid
 * yang bisa muncul di refresh token Google OAuth Playground.
 * Google refresh token bisa mengandung: alphanumeric, -, _, ., /, ~, +, =
 * Format umum dari OAuth Playground: "1//0g..." atau "1//04..."
 */
const connectTokenSchema = z.object({
  refreshToken: z
    .string()
    .min(20, "Refresh token terlalu pendek.")
    .max(1024, "Refresh token terlalu panjang.")
    .regex(
      /^[A-Za-z0-9\-_.~/+=/]+$/,
      "Refresh token mengandung karakter yang tidak valid."
    ),
  emailHint: z.string().email().optional(),
});

// ─── GET /api/storage/accounts ────────────────────────────────────────────
storageAccountRoutes.get("/accounts", async (c) => {
  const repository = new DriveAccountRepository(c.env.DB);
  const accounts = await repository.findAll();

  // FIX: akun yang sudah DISCONNECT (refresh_token_encrypted dikosongkan oleh
  // DELETE /accounts/:id karena masih punya file) JANGAN tampil lagi di list
  // provider (Google Drive / OneDrive / Dropbox). Sebelumnya findAll() polos →
  // user klik disconnect tapi akun tetap muncul. Konsisten dengan dashboard
  // yang juga sudah exclude token kosong.
  const connectedAccounts = accounts.filter(
    (a) => (a.provider as string) !== "telegram" && (a.refreshTokenEncrypted ?? "") !== ""
  );

  const accountsWithCounts = await Promise.all(
    connectedAccounts.map(async (account) => {
      // FIX: filter deleted_at IS NULL agar konsisten dengan dashboard & file listing
      // Jika tidak, file di Trash tetap kehitung → distribusi tidak sinkron (4 di Drive, 3 di DB dsb)
      const row = await c.env.DB.prepare(
        "SELECT COUNT(*) as count FROM files WHERE drive_account_id = ? AND deleted_at IS NULL"
      ).bind(account.id).first<{ count: number }>();

      return { ...toPublic(account), fileCount: row?.count ?? 0 };
    })
  );

  return c.json({ success: true, data: { accounts: accountsWithCounts } });
});


// --- POST /api/storage/accounts/purge-telegram ---
// Hapus permanen semua akun provider telegram yang sudah deprecated + filenya
// Dibuat karena user hapus telegram tapi masih muncul di distribusi (legacy data)
// FIX: juga hapus upload_logs & upload_sessions yang jadi FK RESTRICT penghambat delete
storageAccountRoutes.post("/accounts/purge-telegram", async (c) => {
  try {
    const { results: teleAccounts } = await c.env.DB.prepare(
      "SELECT id, email FROM drive_accounts WHERE provider = 'telegram'"
    ).all<{ id: number; email: string }>();

    let deletedFiles = 0;
    let deletedLogs = 0;
    let deletedAccounts = 0;

    for (const acc of teleAccounts) {
      // hapus yang jadi blokir FK RESTRICT dulu
      const logDel = await c.env.DB.prepare("DELETE FROM upload_logs WHERE drive_account_id = ?").bind(acc.id).run();
      // @ts-ignore
      deletedLogs += (logDel as any).changes ?? 0;
      await c.env.DB.prepare("DELETE FROM upload_sessions WHERE drive_account_id = ?").bind(acc.id).run();

      const fileDel = await c.env.DB.prepare("DELETE FROM files WHERE drive_account_id = ?").bind(acc.id).run();
      // @ts-ignore D1 meta
      deletedFiles += (fileDel as any).changes ?? 0;
      // migration_jobs ada ON DELETE CASCADE jadi ikut kehapus otomatis, tapi kita coba manual juga biar bersih
      await c.env.DB.prepare("DELETE FROM migration_jobs WHERE source_account_id = ? OR target_account_id = ?").bind(acc.id, acc.id).run();

      await c.env.DB.prepare("DELETE FROM drive_accounts WHERE id = ?").bind(acc.id).run();
      deletedAccounts++;
    }

    writeAuditLog(c, { action: "storage.purge_telegram", status: "warning", detail: `${deletedAccounts} akun, ${deletedFiles} file, ${deletedLogs} logs` });

    return c.json({
      success: true,
      data: {
        message: `Berhasil hapus ${deletedAccounts} akun Telegram, ${deletedFiles} file, ${deletedLogs} upload_logs.`,
        deletedAccounts,
        deletedFiles,
        deletedLogs,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal purge telegram";
    return c.json({ success: false, error: { code: "PURGE_FAILED", message: msg } }, 500);
  }
});

// --- POST /api/storage/accounts/format-all ---
// Hard-delete semua file dari semua akun Google Drive, tapi akun tetap terhubung.
storageAccountRoutes.post("/accounts/format-all", async (c) => {
  const driveAccountRepository = new DriveAccountRepository(c.env.DB);
  const accounts = await driveAccountRepository.findAll();
  const results: Array<{
    accountId: number;
    email: string;
    deletedFiles: number;
    status: "ok" | "error";
    error?: string;
  }> = [];

  for (const account of accounts) {
    try {
      const result = await formatDriveAccount({ env: c.env, account });
      results.push({ accountId: account.id, email: account.email, deletedFiles: result.deletedFiles, status: "ok" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`Gagal format drive akun ${account.id}:`, error);
      results.push({ accountId: account.id, email: account.email, deletedFiles: 0, status: "error", error: message });
    }
  }

  const totalDeletedFiles = results.reduce((sum, item) => sum + item.deletedFiles, 0);
  return c.json({
    success: true,
    data: {
      message: "Semua drive selesai diformat.",
      totalDeletedFiles,
      results,
    },
  });
});

// --- POST /api/storage/accounts/:id/format ---
// Hard-delete semua file di satu akun Google Drive, tapi akun tetap terhubung.
storageAccountRoutes.post("/accounts/:id/format", async (c) => {
  const id = Number(c.req.param("id"));
  if (isNaN(id)) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: "Akun tidak ditemukan." } },
      404
    );
  }

  const driveAccountRepository = new DriveAccountRepository(c.env.DB);
  const account = await driveAccountRepository.findById(id);

  if (!account) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: "Akun tidak ditemukan." } },
      404
    );
  }

  const result = await formatDriveAccount({ env: c.env, account });
  return c.json({
    success: true,
    data: {
      message: "Drive berhasil diformat.",
      accountId: account.id,
      email: account.email,
      deletedFiles: result.deletedFiles,
    },
  });
});

// ─── GET /api/storage/accounts/:id ────────────────────────────────────────
storageAccountRoutes.get("/accounts/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const repository = new DriveAccountRepository(c.env.DB);
  const account = await repository.findById(id);

  if (!account) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: "Akun tidak ditemukan." } },
      404
    );
  }

  return c.json({ success: true, data: { account: toPublic(account) } });
});

// ─── DELETE /api/storage/accounts/:id ─────────────────────────────────────
storageAccountRoutes.delete("/accounts/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const repository = new DriveAccountRepository(c.env.DB);

  const account = await repository.findById(id);
  if (!account) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: "Akun tidak ditemukan." } },
      404
    );
  }

  // FIX telegram: force delete meski ada file, karena provider sudah deprecated dan user sudah hapus tapi masih muncul di distribusi
  // + fix FK RESTRICT: hapus upload_logs & sessions dulu baru bisa delete akun
  const isTelegram = (account.provider as string) === "telegram";
  if (isTelegram) {
    await c.env.DB.prepare("DELETE FROM upload_logs WHERE drive_account_id = ?").bind(id).run();
    await c.env.DB.prepare("DELETE FROM upload_sessions WHERE drive_account_id = ?").bind(id).run();
    await c.env.DB.prepare("DELETE FROM migration_jobs WHERE source_account_id = ? OR target_account_id = ?").bind(id, id).run();
    await c.env.DB.prepare("DELETE FROM files WHERE drive_account_id = ?").bind(id).run();
    await repository.delete(id);
    writeAuditLog(c, { action: "storage.disconnect", status: "warning", detail: `${account.email} [telegram force delete]` });
    return c.json({ success: true, data: { message: "Akun Telegram berhasil dihapus permanen beserta filenya." } });
  }

  // Count files associated with this account
  const filesRow = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM files WHERE drive_account_id = ? AND deleted_at IS NULL"
  ).bind(id).first<{ count: number }>();
  const filesCount = filesRow?.count ?? 0;

  if (filesCount > 0) {
    await c.env.DB.prepare(
      `UPDATE drive_accounts
       SET refresh_token_encrypted = '', access_token = NULL,
           access_token_expires_at = NULL, status = 'offline',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(id).run();
    writeAuditLog(c, { action: "storage.disconnect", status: "warning", detail: account.email });
    return c.json({
      success: true,
      data: { message: `Akun diputus. ${filesCount} file tetap di list — login ulang untuk mengaktifkan download.` },
    });
  } else {
    // No files, delete completely - hapus dulu FK yang RESTRICT
    await c.env.DB.prepare("DELETE FROM upload_logs WHERE drive_account_id = ?").bind(id).run();
    await c.env.DB.prepare("DELETE FROM upload_sessions WHERE drive_account_id = ?").bind(id).run();
    await c.env.DB.prepare("DELETE FROM migration_jobs WHERE source_account_id = ? OR target_account_id = ?").bind(id, id).run();
    await repository.delete(id);
    writeAuditLog(c, { action: "storage.disconnect", status: "warning", detail: account.email });
    return c.json({ success: true, data: { message: "Akun berhasil dihapus." } });
  }
});

// ─── POST /api/storage/accounts/connect ───────────────────────────────────
storageAccountRoutes.post(
  "/accounts/connect",
  zValidator("json", connectTokenSchema),
  async (c) => {
    const { refreshToken } = c.req.valid("json");
    const connectionService = new GoogleAccountConnectionService(c.env);

    try {
      const account = await connectionService.connectViaRefreshToken(refreshToken);
      writeAuditLog(c, { action: "storage.connect", status: "success", detail: account.email });
      return c.json({ success: true, data: { account: toPublic(account) } }, 201);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Gagal menghubungkan akun Google Drive.";

      const isKnownError =
        message.includes("Refresh token") ||
        message.includes("scope") ||
        message.includes("sudah terhubung") ||
        message.includes("tidak boleh kosong") ||
        message.includes("Format refresh token") ||
        message.includes("email");

      return c.json(
        {
          success: false,
          error: {
            code: "CONNECT_FAILED",
            message: isKnownError
              ? message
              : "Gagal menghubungkan akun. Pastikan refresh token valid dan coba lagi.",
          },
        },
        400
      );
    }
  }
);

// ─── POST /api/storage/accounts/validate ──────────────────────────────────
/**
 * Validasi refresh token tanpa menyimpannya.
 *
 * FIX Bug 3: error message sekarang informatif — bukan hanya "Token tidak valid"
 * tapi menyertakan petunjuk apa yang salah (scope, token dicabut, dll).
 */
storageAccountRoutes.post(
  "/accounts/validate",
  zValidator("json", connectTokenSchema),
  async (c) => {
    const { refreshToken } = c.req.valid("json");

    try {
      const tokens = await exchangeRefreshToken({
        refreshToken: refreshToken.trim(),
        clientId: c.env.GOOGLE_CLIENT_ID,
        clientSecret: c.env.GOOGLE_CLIENT_SECRET,
      });

      const accountInfo = await fetchGoogleAccountInfo(tokens.accessToken);

      return c.json({
        success: true,
        data: { valid: true, email: accountInfo.email },
      });
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Token tidak valid.";

      // Beri pesan yang lebih informatif ke user
      let reason = raw;
      if (raw.includes("invalid_client") || raw.includes("unauthorized_client")) {
        reason =
          "GOOGLE_CLIENT_ID atau GOOGLE_CLIENT_SECRET di worker salah. Periksa secrets Wrangler.";
      } else if (raw.includes("invalid_grant")) {
        reason =
          "Refresh token sudah kadaluarsa atau dicabut. Buat token baru di Google OAuth Playground.";
      } else if (raw.includes("scope")) {
        reason =
          "Token tidak memiliki scope Google Drive. Pastikan scope 'https://www.googleapis.com/auth/drive' sudah dicentang.";
      }

      return c.json({
        success: true,
        data: { valid: false, reason },
      });
    }
  }
);

// ─── POST /api/storage/accounts/validate zValidator error handler ──────────
// FIX Bug 2b: Kalau Zod reject token (regex gagal), kembalikan pesan jelas
// bukan hanya 400 generik
storageAccountRoutes.onError((err, c) => {
  return c.json(
    {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: err instanceof Error ? err.message : "Input tidak valid.",
      },
    },
    400
  );
});

// ─── POST /api/storage/accounts/sync-all ──────────────────────────────────
/**
 * Trigger sync manual semua akun Google Drive.
 * Menggunakan logika yang sama dengan cron job otomatis (setiap 10 menit),
 * tapi bisa dipanggil kapan saja dari dashboard Storage Manager.
 */
storageAccountRoutes.post("/accounts/sync-all", async (c) => {
  const driveAccountRepository = new DriveAccountRepository(c.env.DB);
  const { StorageProviderFactory } = await import("@nqdrive/storage");

  const accounts = await driveAccountRepository.findAll();
  const results: { id: number; email: string; status: "ok" | "error"; error?: string }[] = [];

  for (const account of accounts) {
    // Skip disconnect (token kosong) — already offline
    if (!account.refreshTokenEncrypted) {
      results.push({ id: account.id, email: account.email, status: "ok" });
      continue;
    }
    try {
      const credentials = await resolveCredentials(account, c.env);
      const provider = StorageProviderFactory.resolve(account.provider);
      let quota = await provider.getQuota({ credentials: credentials as any });

      await driveAccountRepository.updateQuota(account.id, quota);
      await driveAccountRepository.updateStatus(account.id, "online");
      results.push({ id: account.id, email: account.email, status: "ok" });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      await driveAccountRepository.updateStatus(account.id, "error");
      results.push({ id: account.id, email: account.email, status: "error", error: msg });
    }
  }

  const failed = results.filter((r) => r.status === "error").length;
  return c.json({
    success: true,
    data: {
      message: `Sync selesai. ${results.length - failed}/${results.length} akun berhasil disync.`,
      results,
    },
  });
});

// ─── GET /api/storage/summary ─────────────────────────────────────────────
storageAccountRoutes.get("/summary", async (c) => {
  const driveAccountRepository = new DriveAccountRepository(c.env.DB);
  const fileRepository = new FileRepository(c.env.DB);

  const allAccounts = await driveAccountRepository.findAll();
  // Konsisten dengan GET /accounts & dashboard: akun disconnect (token kosong)
  // dan telegram legacy tidak ikut dihitung di summary Storage Manager
  const accounts = allAccounts.filter(
    (a) => (a.provider as string) !== "telegram" && (a.refreshTokenEncrypted ?? "") !== ""
  );
  const fileCount = await fileRepository.countAll();
  const downloadCount = await fileRepository.sumDownloadCount();

  const totalStorageBytes = accounts.reduce((sum, a) => sum + a.totalStorageBytes, 0);
  const usedStorageBytes = accounts.reduce((sum, a) => sum + a.usedStorageBytes, 0);
  const availableStorageBytes = accounts.reduce((sum, a) => sum + a.availableStorageBytes, 0);

  const accountBreakdown = accounts.map((account) => ({
    id: account.id,
    email: account.email,
    provider: account.provider,
    totalStorageBytes: account.totalStorageBytes,
    usedStorageBytes: account.usedStorageBytes,
    availableStorageBytes: account.availableStorageBytes,
    usedPercentage: calculatePercentage(account.usedStorageBytes, account.totalStorageBytes),
    status: account.status,
    lastSyncedAt: account.lastSyncedAt,
  }));

  return c.json({
    success: true,
    data: {
      totalStorageBytes,
      usedStorageBytes,
      availableStorageBytes,
      usedPercentage: calculatePercentage(usedStorageBytes, totalStorageBytes),
      totalAccounts: accounts.length,
      onlineAccounts: accounts.filter((a) => a.status === "online").length,
      offlineAccounts: accounts.filter((a) => a.status === "offline").length,
      totalFiles: fileCount,
      totalDownloads: downloadCount,
      accounts: accountBreakdown,
    },
  });
});

export { storageAccountRoutes };
