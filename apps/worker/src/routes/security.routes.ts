import { Hono } from "hono";
import { requireAuth, getAuthPayload } from "../middleware/require-auth.middleware";
import { generateSecret, verifyTOTP } from "../utils/totp";
import type { Env } from "../config/env";

const securityApiRoutes = new Hono<{ Bindings: Env }>();

interface BlockedIpItem {
  ip: string;
  type: "login" | "download";
  locked_until?: number;
  attempts?: number;
}

// ─── BLOCKED IPS MANAGEMENT ──────────────────────────────────────────────────

securityApiRoutes.get("/blocked-ips", requireAuth, async (c) => {
  const db = c.env.DB;
  const nowSeconds = Math.floor(Date.now() / 1000);

  // Get locked login IPs
  const loginRows = await db.prepare("SELECT * FROM login_attempts WHERE locked_until > ?").bind(nowSeconds).all<{ ip: string; locked_until: number }>();
  
  // Get settings to check download rate limit
  const rateLimitStr = await db.prepare("SELECT value FROM settings WHERE key = 'rate_limit_download'").first<{ value: string }>();
  const downloadLimit = rateLimitStr ? Number(rateLimitStr.value) : 0;
  
  let downloadRows: { ip: string; attempts: number }[] = [];
  if (downloadLimit > 0) {
    const daySeconds = 24 * 60 * 60;
    downloadRows = await db.prepare("SELECT ip, attempts FROM download_attempts WHERE attempts >= ? AND last_attempt > ?")
      .bind(downloadLimit, nowSeconds - daySeconds)
      .all<{ ip: string; attempts: number }>().then(r => r.results);
  }

  const list: BlockedIpItem[] = [];
  
  for (const r of loginRows.results) {
    list.push({ ip: r.ip, type: "login", locked_until: r.locked_until });
  }
  for (const r of downloadRows) {
    // Avoid duplicate IP listing
    if (!list.some(item => item.ip === r.ip)) {
      list.push({ ip: r.ip, type: "download", attempts: r.attempts });
    }
  }

  return c.json({ success: true, data: { items: list } });
});

securityApiRoutes.post("/blocked-ips/unblock", requireAuth, async (c) => {
  const db = c.env.DB;
  const body = await c.req.json<{ ip: string }>().catch(() => null);
  const ip = body?.ip?.trim();
  if (!ip) return c.json({ success: false, error: { message: "IP tidak valid" } }, 400);

  await db.prepare("DELETE FROM login_attempts WHERE ip = ?").bind(ip).run();
  await db.prepare("DELETE FROM download_attempts WHERE ip = ?").bind(ip).run();

  return c.json({ success: true, data: { message: `Blokir IP ${ip} berhasil dihapus.` } });
});

// ─── 2FA MANAGEMENT ──────────────────────────────────────────────────────────

// Generate TOTP keys + Backup codes
securityApiRoutes.post("/2fa/generate", requireAuth, async (c) => {
  const payload = getAuthPayload(c);
  const secret = generateSecret();
  const issuer = encodeURIComponent("NQDRIVE");
  const account = encodeURIComponent(payload.username);
  
  // Format standard QR Code URI for Google Authenticator / Authy
  const qrUri = `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

  // Generate 8 unique alphanumeric backup codes (length 8)
  const backupCodes: string[] = [];
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 8; i++) {
    let code = "";
    for (let j = 0; j < 8; j++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    backupCodes.push(code);
  }

  return c.json({
    success: true,
    data: {
      secret,
      qrUri,
      backupCodes,
    },
  });
});

// Enable 2FA after successful token verification
securityApiRoutes.post("/2fa/enable", requireAuth, async (c) => {
  const payload = getAuthPayload(c);
  const body = await c.req.json<{ token: string; secret: string; backupCodes: string[] }>();
  
  if (!body.token || !body.secret || !body.backupCodes) {
    return c.json({ success: false, error: { message: "Input tidak lengkap." } }, 400);
  }

  const isValid = await verifyTOTP(body.token, body.secret);
  if (!isValid) {
    return c.json({ success: false, error: { message: "Kode OTP tidak valid." } }, 400);
  }

  // Encrypt backup codes as string JSON
  const backupCodesStr = JSON.stringify(body.backupCodes);

  await c.env.DB.prepare(
    "UPDATE users SET totp_secret = ?, totp_enabled = 1, backup_codes = ? WHERE id = ?"
  ).bind(body.secret, backupCodesStr, payload.sub).run();

  return c.json({ success: true, data: { message: "2FA berhasil diaktifkan." } });
});

// Disable 2FA
securityApiRoutes.post("/2fa/disable", requireAuth, async (c) => {
  const payload = getAuthPayload(c);
  await c.env.DB.prepare(
    "UPDATE users SET totp_secret = NULL, totp_enabled = 0, backup_codes = NULL WHERE id = ?"
  ).bind(payload.sub).run();

  return c.json({ success: true, data: { message: "2FA berhasil dinonaktifkan." } });
});

export { securityApiRoutes };
