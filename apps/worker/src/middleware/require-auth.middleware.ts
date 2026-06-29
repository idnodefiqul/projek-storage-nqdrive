import type { Context, Next } from "hono";
import { verifyJwt } from "../utils/jwt";
import { SESSION_COOKIE_NAME } from "@nqdrive/shared";
import { hashApiKey } from "../utils/api-key";
import { ApiKeyRepository } from "../database/api-key.repository";
import type { Env } from "../config/env";
import type { JwtPayload } from "@nqdrive/types";

/**
 * Hono middleware that guards routes requiring an authenticated admin session.
 *
 * Mendukung dua mode autentikasi:
 * 1. Session cookie (HttpOnly JWT) — untuk dashboard web
 * 2. Bearer token (API key) — untuk akses programatik via Authorization header
 *
 * SECURITY FIX #15: Sebelumnya API key sama sekali tidak diimplementasikan
 * di middleware ini — hanya dibuat tapi tidak pernah bisa dipakai untuk akses API.
 * Fix ini menambahkan dukungan Authorization: Bearer <api-key> di samping cookie.
 */
export async function requireAuth(c: Context<{ Bindings: Env }>, next: Next) {
  // --- Coba cookie dulu (dashboard web flow) ---
  const cookieToken = getCookie(c.req.header("Cookie"), SESSION_COOKIE_NAME);

  if (cookieToken) {
    const payload = await verifyJwt(cookieToken, c.env.JWT_SECRET);
    if (!payload) {
      return c.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Sesi tidak valid atau sudah berakhir." } },
        401
      );
    }
    c.set("jwtPayload" as never, payload as never);
    await next();
    return;
  }

  // --- Coba API key (programmatic access) ---
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const rawKey = authHeader.slice("Bearer ".length).trim();
    if (rawKey) {
      const keyHash = await hashApiKey(rawKey);
      const apiKeyRepo = new ApiKeyRepository(c.env.DB);
      const apiKey = await apiKeyRepo.findByHash(keyHash);

      if (apiKey && !apiKey.revokedAt) {
        // Update last_used_at (fire-and-forget, jangan block response)
        void apiKeyRepo.updateLastUsed(apiKey.id);

        // Buat synthetic payload agar handler downstream tetap kompatibel
        const syntheticPayload: JwtPayload = {
          sub: 0, // API key tidak terikat ke user ID spesifik
          username: `apikey:${apiKey.keyPrefix}`,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        };
        c.set("jwtPayload" as never, syntheticPayload as never);
        await next();
        return;
      }
    }
  }

  // --- Tidak ada kredensial valid ---
  return c.json(
    { success: false, error: { code: "UNAUTHENTICATED", message: "Sesi tidak ditemukan, silakan login." } },
    401
  );
}

/** Reads a named cookie value from a raw Cookie header string. */
function getCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";").map((part) => part.trim());
  for (const cookie of cookies) {
    const [cookieName, ...rest] = cookie.split("=");
    if (cookieName === name) return rest.join("=");
  }
  return null;
}

/** Helper for handlers to read the authenticated user's payload set by requireAuth. */
export function getAuthPayload(c: Context): JwtPayload {
  return c.get("jwtPayload" as never) as JwtPayload;
}
