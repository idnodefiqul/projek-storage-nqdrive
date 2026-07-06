import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { setupAdminSchema, loginSchema, changePasswordSchema } from "@nqdrive/api";
import { SESSION_COOKIE_NAME, JWT_EXPIRY_SECONDS } from "@nqdrive/shared";
import { AuthService, AuthError } from "../services/auth.service";
import { requireAuth, getAuthPayload } from "../middleware/require-auth.middleware";
import { requireSetupNotCompleted } from "../middleware/require-setup-not-completed.middleware";
import { SettingsRepository } from "../database/settings.repository";
import { verifyTOTP } from "../utils/totp";
import { UserRepository } from "../database/user.repository";
import { signJwt, verifyJwt } from "../utils/jwt";
import { extractRealIp } from "../utils/ip-parser";
import { writeAuditLog } from "../utils/audit";
import type { Env } from "../config/env";

const authRoutes = new Hono<{ Bindings: Env }>();

interface LoginAttemptRow {
  ip: string;
  attempts: number;
  locked_until: number;
}

// Helper to get client IP
function getClientIp(c: any): string {
  return extractRealIp(c);
}

/**
 * GET /system/state (sebelumnya /api/auth/setup-status)
 */
export const systemStateRoutes = new Hono<{ Bindings: Env }>();
export const meRoutes = new Hono<{ Bindings: Env }>();

systemStateRoutes.get("/state", async (c) => {
  // Anti-direct browsing protection
  const clientHeader = c.req.header("X-App-Client");
  if (clientHeader !== "nqdrive-web") {
    return new Response(null, { status: 404 });
  }

  const authService = new AuthService(c.env);
  const completed = await authService.isSetupCompleted();
  
  // Header ini memastikan browser/CDN tidak meng-cache status setup yang usang, 
  // karena bergantung sepenuhnya ke DB.
  c.header("Cache-Control", "no-store, no-cache, must-revalidate");
  
  return c.json({ success: true, data: { setupCompleted: completed } });
});

/**
 * POST /api/auth/setup
 */
authRoutes.post("/setup", requireSetupNotCompleted, zValidator("json", setupAdminSchema), async (c) => {
  const input = c.req.valid("json");
  const authService = new AuthService(c.env);

  try {
    const user = await authService.setupAdmin(input);
    return c.json({ success: true, data: { user } }, 201);
  } catch (error) {
    if (error instanceof AuthError) {
      return c.json({ success: false, error: { code: "SETUP_FAILED", message: error.message } }, error.statusCode as 403);
    }
    throw error;
  }
});

/**
 * POST /api/auth/login
 * SECURITY FIX #4: rate limiting berdasarkan IP
 * SECURITY FIX #5: tambah SameSite=Strict + pastikan Secure di production
 */
authRoutes.post("/login", zValidator("json", loginSchema), async (c) => {
  const ip = getClientIp(c);
  const settingsRepo = new SettingsRepository(c.env.DB);
  const rateLimitSetting = await settingsRepo.get("rate_limit_login");
  const maxAttempts = rateLimitSetting ? Number(rateLimitSetting) : 0;

  // DB-based Persistent rate limiting
  if (maxAttempts > 0) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const attempt = await c.env.DB.prepare("SELECT * FROM login_attempts WHERE ip = ?").bind(ip).first<LoginAttemptRow>();

    if (attempt && attempt.locked_until > nowSeconds) {
      const remainingSeconds = attempt.locked_until - nowSeconds;
      const remainingMinutes = Math.ceil(remainingSeconds / 60);
      return c.json(
        {
          success: false,
          error: {
            code: "RATE_LIMITED",
            message: `Akun terkunci karena terlalu banyak percobaan login. Silakan coba lagi dalam ${remainingMinutes} menit.`,
          },
        },
        429
      );
    }
  }

  const input = c.req.valid("json");
  const inputAny = input as any;

  // 1. Turnstile Captcha Verification
  const turnstileEnabled = (await settingsRepo.get("turnstile_enabled")) === "true";
  if (turnstileEnabled) {
    const turnstileToken = inputAny.turnstileToken;
    const secretKey = await settingsRepo.get("turnstile_secretkey");
    if (!turnstileToken || !secretKey) {
      return c.json({ success: false, error: { code: "CAPTCHA_FAILED", message: "Verifikasi Captcha diperlukan." } }, 400);
    }

    const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${encodeURIComponent(secretKey)}&response=${encodeURIComponent(turnstileToken)}&remoteip=${encodeURIComponent(ip)}`,
    });
    const verifyData = await verifyRes.json() as any;
    if (!verifyData.success) {
      return c.json({ success: false, error: { code: "CAPTCHA_FAILED", message: "Verifikasi Captcha gagal. Silakan coba lagi." } }, 400);
    }
  }

  const authService = new AuthService(c.env);

  try {
    // We get the user row to check if 2FA is active
    const userRepo = new UserRepository(c.env.DB);
    const user = await userRepo.findByUsername(input.username);

    if (!user) {
      throw new AuthError("Username atau password salah.", 401);
    }

    // Verify password directly
    const { verifyPassword } = await import("../utils/password");
    const isPasswordValid = await verifyPassword(input.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AuthError("Username atau password salah.", 401);
    }

    // Login success -> clear failed attempts history for this IP
    if (maxAttempts > 0) {
      await c.env.DB.prepare("DELETE FROM login_attempts WHERE ip = ?").bind(ip).run();
    }

    // 2. Check if 2FA (TOTP) is enabled
    // Note: user.totpEnabled comes from rowToUser mapping we edited
    if ((user as any).totpEnabled) {
      // Issue a short-lived temp token (valid for 5 mins / 300 seconds)
      const tempToken = await signJwt(
        { sub: user.id, username: user.username, email: user.email, type: "2fa_pending" } as any,
        c.env.JWT_SECRET,
        300
      );

      return c.json({
        success: true,
        data: {
          twoFactorRequired: true,
          tempToken,
        },
      });
    }

    // Standard login flow (2FA disabled) Ã¢â‚¬â€ issue JWT directly (password already verified above)
    const token = await signJwt(
      { sub: user.id, username: user.username, email: user.email },
      c.env.JWT_SECRET,
      JWT_EXPIRY_SECONDS
    );

    const isProduction = c.env.APP_ENV === "production";
    const cookieAttributes = [
      `${SESSION_COOKIE_NAME}=${token}`,
      "HttpOnly",
      "Path=/",
      "SameSite=None",
      `Max-Age=${JWT_EXPIRY_SECONDS}`,
      "Secure",
    ].join("; ");

    c.header("Set-Cookie", cookieAttributes);
    writeAuditLog(c, { action: "login", status: "success", user: user.username, detail: "Login berhasil" });
    return c.json({ success: true, data: { user: { id: user.id, username: user.username, email: user.email } } });
  } catch (error) {
    if (error instanceof AuthError) {
      writeAuditLog(c, { action: "login", status: "error", user: input.username, detail: error.message });
      if (maxAttempts > 0) {
        const nowSeconds = Math.floor(Date.now() / 1000);
        const attempt = await c.env.DB.prepare("SELECT * FROM login_attempts WHERE ip = ?").bind(ip).first<LoginAttemptRow>();

        if (!attempt) {
          await c.env.DB.prepare("INSERT INTO login_attempts (ip, attempts, locked_until) VALUES (?, 1, 0)").bind(ip).run();
        } else {
          const nextAttempts = attempt.attempts + 1;
          if (nextAttempts >= maxAttempts) {
            // Lock IP for 1 hour (3600 seconds)
            const lockTime = nowSeconds + 3600;
            await c.env.DB.prepare("UPDATE login_attempts SET attempts = 0, locked_until = ? WHERE ip = ?").bind(lockTime, ip).run();
          } else {
            await c.env.DB.prepare("UPDATE login_attempts SET attempts = ? WHERE ip = ?").bind(nextAttempts, ip).run();
          }
        }
      }

      return c.json({ success: false, error: { code: "LOGIN_FAILED", message: error.message } }, error.statusCode as 401);
    }
    throw error;
  }
});

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ 2FA LOGIN VERIFICATION ENDPOINT Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

authRoutes.post("/login/2fa", async (c) => {
  const body = await c.req.json<{ tempToken: string; code: string }>().catch(() => null);
  if (!body?.tempToken || !body?.code) {
    return c.json({ success: false, error: { message: "Input tidak lengkap." } }, 400);
  }

  try {
    // 1. Verify tempToken
    const payload = await verifyJwt(body.tempToken, c.env.JWT_SECRET);
    if (!payload || (payload as any).type !== "2fa_pending") {
      return c.json({ success: false, error: { message: "Token tidak valid." } }, 400);
    }

    // 2. Fetch user row
    const userRepo = new UserRepository(c.env.DB);
    const user = await userRepo.findById(Number(payload.sub));
    if (!user) {
      return c.json({ success: false, error: { message: "User tidak ditemukan." } }, 400);
    }

    // 3. Verify OTP code (or backup code)
    const code = body.code.trim();
    let isCodeValid = false;

    // Check TOTP
    if ((user as any).totpSecret) {
      isCodeValid = await verifyTOTP(code, (user as any).totpSecret);
    }

    // Check Backup Codes
    if (!isCodeValid && (user as any).backupCodes) {
      try {
        const codes = JSON.parse((user as any).backupCodes) as string[];
        const matchIdx = codes.findIndex((c) => c.toLowerCase() === code.toLowerCase());
        if (matchIdx !== -1) {
          isCodeValid = true;
          // Consume backup code (remove it so it can't be reused)
          codes.splice(matchIdx, 1);
          const nextCodesStr = JSON.stringify(codes);
          await c.env.DB.prepare("UPDATE users SET backup_codes = ? WHERE id = ?").bind(nextCodesStr, user.id).run();
        }
      } catch (err) {
        console.error("Failed to parse backup codes:", err);
      }
    }

    if (!isCodeValid) {
      return c.json({ success: false, error: { code: "OTP_FAILED", message: "Kode 2FA / Backup Code salah." } }, 400);
    }

    // 4. Issue final session JWT cookie
    const token = await signJwt(
      { sub: user.id, username: user.username, email: user.email },
      c.env.JWT_SECRET,
      JWT_EXPIRY_SECONDS
    );

    const isProduction = c.env.APP_ENV === "production";
    const cookieAttributes = [
      `${SESSION_COOKIE_NAME}=${token}`,
      "HttpOnly",
      "Path=/",
      "SameSite=None",
      `Max-Age=${JWT_EXPIRY_SECONDS}`,
      "Secure",
    ].join("; ");

    c.header("Set-Cookie", cookieAttributes);
    writeAuditLog(c, { action: "login.2fa", status: "success", user: user.username, detail: "Login 2FA berhasil" });
    return c.json({ success: true, data: { user: { id: user.id, username: user.username, email: user.email } } });
  } catch (err) {
    writeAuditLog(c, { action: "login.2fa", status: "error", detail: "Verifikasi 2FA gagal" });
    return c.json({ success: false, error: { message: "Verifikasi 2FA kedaluwarsa atau tidak valid." } }, 401);
  }
});

/**
 * POST /api/auth/logout
 * SECURITY FIX #6: tambah requireAuth ke logout agar tidak bisa di-spam oleh pihak luar,
 * dan pastikan cookie di-clear dengan semua atribut yang sama persis saat di-set.
 */
authRoutes.post("/logout", requireAuth, (c) => {
  const isProduction = c.env.APP_ENV === "production";
  const clearCookie = [
    `${SESSION_COOKIE_NAME}=`,
    "HttpOnly",
    "Path=/",
    "SameSite=None",
    "Max-Age=0",
    "Secure",
  ].join("; ");

  c.header("Set-Cookie", clearCookie);
  writeAuditLog(c, { action: "logout", status: "info" });
  return c.json({ success: true, data: { message: "Logout berhasil." } });
});

/** GET /api/me */
meRoutes.get("/", requireAuth, async (c) => {
  const payload = getAuthPayload(c);
  const userRepo = new UserRepository(c.env.DB);
  const user = await userRepo.findById(payload.sub);

  if (!user) {
    return c.json({ success: false, error: { code: "USER_NOT_FOUND", message: "User tidak ditemukan." } }, 404);
  }

  return c.json({
    success: true,
    data: {
      id: user.id,
      username: user.username,
      email: user.email,
      totpEnabled: Boolean((user as any).totpEnabled),
    },
  });
});

/**
 * POST /api/auth/change-password
 */
authRoutes.post(
  "/change-password",
  requireAuth,
  zValidator("json", changePasswordSchema),
  async (c) => {
    const input = c.req.valid("json");
    const payload = getAuthPayload(c);
    const authService = new AuthService(c.env);

    try {
      await authService.changePassword(payload.sub, input);
      writeAuditLog(c, { action: "password.change", status: "success", detail: "Password berhasil diubah" });
      return c.json({ success: true, data: { message: "Password berhasil diubah." } });
    } catch (error) {
      if (error instanceof AuthError) {
        return c.json(
          { success: false, error: { code: "CHANGE_PASSWORD_FAILED", message: error.message } },
          error.statusCode as 401 | 404
        );
      }
      throw error;
    }
  }
);

export { authRoutes };
