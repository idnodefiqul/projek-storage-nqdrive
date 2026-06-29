import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { requireAuth } from "../middleware/require-auth.middleware";
import { DriveAccountRepository } from "../database/drive-account.repository";
import { FileRepository } from "../database/file.repository";
import { GoogleAccountConnectionService } from "../services/google-account-connection.service";
import { exchangeRefreshToken, fetchGoogleAccountInfo } from "../services/google-oauth.service";
import { calculatePercentage } from "@nqdrive/shared";
import type { Env } from "../config/env";
import type { PublicDriveAccount } from "@nqdrive/types";

const storageAccountRoutes = new Hono<{ Bindings: Env }>();

storageAccountRoutes.use("*", requireAuth);

// ─── Helper ───────────────────────────────────────────────────────────────

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
  return c.json({ success: true, data: { accounts: accounts.map(toPublic) } });
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

  try {
    await repository.delete(id);
    return c.json({ success: true, data: { message: "Akun berhasil dihapus." } });
  } catch {
    return c.json(
      {
        success: false,
        error: {
          code: "ACCOUNT_HAS_FILES",
          message:
            "Akun masih memiliki file. Pindahkan atau hapus file terkait sebelum menghapus akun ini.",
        },
      },
      409
    );
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
