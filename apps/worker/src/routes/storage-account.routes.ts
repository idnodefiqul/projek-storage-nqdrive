import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { requireAuth } from "../middleware/require-auth.middleware";
import { DriveAccountRepository } from "../database/drive-account.repository";
import { FileRepository } from "../database/file.repository";
import { GoogleAccountConnectionService } from "../services/google-account-connection.service";
import {
  exchangeRefreshToken,
  fetchGoogleAccountInfo,
  buildGoogleAuthUrl,
} from "../services/google-oauth.service";
import { signJwt, verifyJwt } from "../utils/jwt";
import { calculatePercentage } from "@nqdrive/shared";
import { StorageProviderFactory } from "@nqdrive/storage";
import { writeAuditLog } from "../utils/audit";
import { resolveCredentials } from "../utils/credentials";
import type { Env } from "../config/env";
import type { PublicDriveAccount, DriveAccount } from "@nqdrive/types";

const storageAccountRoutes = new Hono<{ Bindings: Env }>();

// Redirect URI OAuth harus menunjuk ke worker (yang memegang GOOGLE_CLIENT_SECRET),
// dan HARUS sama persis dengan yang didaftarkan di Google Cloud Console.
function getRedirectUri(env: Env): string {
  return `${env.GOOGLE_OAUTH_REDIRECT_URI.replace(/\/$/, "")}/api/storage/accounts/oauth/callback`;
}

// URL dashboard tujuan redirect balik setelah callback (sukses/gagal).
function getDashboardUrl(env: Env): string {
  return `${(env.WEB_APP_URL || "https://drive.fiqul.id").replace(/\/$/, "")}/dashboard/storage-manager`;
}

// ─── OAuth callback (Google redirect ke sini — TANPA requireAuth) ──────────
// Didaftarkan SEBELUM requireAuth agar Google (yang tak punya cookie sesi) bisa mengaksesnya.
// Proteksi CSRF via `state` JWT bertanda-tangan yang kita terbitkan di /oauth/url.
storageAccountRoutes.get("/accounts/oauth/callback", async (c) => {
  const dashboard = getDashboardUrl(c.env);
  const code = c.req.query("code");
  const state = c.req.query("state");
  const oauthError = c.req.query("error");

  // User menolak izin di halaman Google, atau Google mengembalikan error.
  if (oauthError) {
    return c.redirect(`${dashboard}?oauth=error&reason=${encodeURIComponent(oauthError)}`);
  }
  if (!code || !state) {
    return c.redirect(`${dashboard}?oauth=error&reason=missing_code`);
  }

  // Validasi state (CSRF): harus JWT valid yang kita terbitkan sendiri.
  const statePayload = await verifyJwt(state, c.env.JWT_SECRET);
  if (!statePayload || statePayload.email !== "oauth-state@nqdrive.internal") {
    return c.redirect(`${dashboard}?oauth=error&reason=invalid_state`);
  }

  try {
    const connectionService = new GoogleAccountConnectionService(c.env);
    const account = await connectionService.connectViaAuthCode(code, getRedirectUri(c.env));
    return c.redirect(`${dashboard}?oauth=success&email=${encodeURIComponent(account.email)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "connect_failed";
    return c.redirect(`${dashboard}?oauth=error&reason=${encodeURIComponent(message)}`);
  }
});

storageAccountRoutes.use("*", requireAuth);

// ─── GET /api/storage/accounts/oauth/url ───────────────────────────────────
// Admin terautentikasi meminta URL consent Google. Kita terbitkan `state` JWT
// berumur pendek untuk proteksi CSRF, lalu frontend melakukan window.location ke URL ini.
storageAccountRoutes.get("/accounts/oauth/url", async (c) => {
  const state = await signJwt(
    { sub: 0, username: "oauth", email: "oauth-state@nqdrive.internal" },
    c.env.JWT_SECRET,
    600 // 10 menit
  );

  const url = buildGoogleAuthUrl({
    clientId: c.env.GOOGLE_CLIENT_ID,
    redirectUri: getRedirectUri(c.env),
    state,
  });

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
  const accountsWithCounts = await Promise.all(
    accounts.map(async (account) => {
      const row = await c.env.DB.prepare(
        "SELECT COUNT(*) as count FROM files WHERE drive_account_id = ?"
      ).bind(account.id).first<{ count: number }>();

      return { ...toPublic(account), fileCount: row?.count ?? 0 };
    })
  );

  return c.json({ success: true, data: { accounts: accountsWithCounts } });
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
    // No files, delete completely
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

  const accounts = await driveAccountRepository.findAll();
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
