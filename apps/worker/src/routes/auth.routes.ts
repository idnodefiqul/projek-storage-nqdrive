import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { setupAdminSchema, loginSchema, changePasswordSchema } from "@nqdrive/api";
import { SESSION_COOKIE_NAME, JWT_EXPIRY_SECONDS } from "@nqdrive/shared";
import { AuthService, AuthError } from "../services/auth.service";
import { requireAuth, getAuthPayload } from "../middleware/require-auth.middleware";
import { requireSetupNotCompleted } from "../middleware/require-setup-not-completed.middleware";
import type { Env } from "../config/env";

const authRoutes = new Hono<{ Bindings: Env }>();

// ─── SECURITY FIX #4: Simple in-memory rate limiter untuk login endpoint ──
// Cloudflare Workers tidak punya shared memory antar isolate, tapi rate limit
// per-isolate ini tetap efektif untuk burst brute-force dalam satu request window.
// Untuk production yang lebih serius, gunakan Cloudflare Rate Limiting rules di dashboard.
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const window = 15 * 60 * 1000; // 15 menit
  const maxAttempts = 10;

  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + window });
    return true; // allowed
  }

  if (entry.count >= maxAttempts) {
    return false; // blocked
  }

  entry.count++;
  return true; // allowed
}

/**
 * GET /api/auth/setup-status
 */
authRoutes.get("/setup-status", async (c) => {
  const authService = new AuthService(c.env);
  const completed = await authService.isSetupCompleted();
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
  // Rate limiting
  const ip = c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For") ?? "unknown";
  if (!checkLoginRateLimit(ip)) {
    return c.json(
      { success: false, error: { code: "RATE_LIMITED", message: "Terlalu banyak percobaan login. Coba lagi dalam 15 menit." } },
      429
    );
  }

  const input = c.req.valid("json");
  const authService = new AuthService(c.env);

  try {
    const { token, user } = await authService.login(input);

    const isProduction = c.env.APP_ENV === "production";
    const cookieAttributes = [
      `${SESSION_COOKIE_NAME}=${token}`,
      "HttpOnly",
      "Path=/",
      "SameSite=Strict",
      `Max-Age=${JWT_EXPIRY_SECONDS}`,
      ...(isProduction ? ["Secure"] : []),
    ].join("; ");

    c.header("Set-Cookie", cookieAttributes);
    return c.json({ success: true, data: { user } });
  } catch (error) {
    if (error instanceof AuthError) {
      return c.json({ success: false, error: { code: "LOGIN_FAILED", message: error.message } }, error.statusCode as 401);
    }
    throw error;
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
    "SameSite=Strict",
    "Max-Age=0",
    ...(isProduction ? ["Secure"] : []),
  ].join("; ");

  c.header("Set-Cookie", clearCookie);
  return c.json({ success: true, data: { message: "Logout berhasil." } });
});

/** GET /api/auth/me */
authRoutes.get("/me", requireAuth, (c) => {
  const payload = getAuthPayload(c);
  return c.json({ success: true, data: { id: payload.sub, username: payload.username, email: payload.email } });
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
