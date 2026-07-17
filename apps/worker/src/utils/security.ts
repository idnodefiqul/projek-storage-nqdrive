import type { Context } from "hono";
import { SettingsRepository } from "../database/settings.repository";
import { extractRealIp } from "./ip-parser";
import type { Env } from "../config/env";

interface DownloadAttemptRow {
  ip: string;
  attempts: number;
  last_attempt: number;
}

// In-memory cache for rate limiting to avoid D1 hit on every download request
// This is per-isolate, so it works as L1 cache before hitting D1
const rateLimitCache = new Map<string, { attempts: number; lastAttempt: number; expires: number }>();
const SETTINGS_CACHE = new Map<string, { data: Record<string, string | null>; expires: number }>();

export async function enforceDownloadSecurity(c: Context<{ Bindings: Env }>): Promise<Response | null> {
  const db = c.env.DB;
  const ip = extractRealIp(c);
  const userAgent = c.req.header("User-Agent") || "";

  // Cache settings for 30s to avoid D1 hit on every download
  let settings: Record<string, string | null>;
  const settingsCached = SETTINGS_CACHE.get("dl_settings");
  if (settingsCached && Date.now() < settingsCached.expires) {
    settings = settingsCached.data as Record<string, string | null>;
  } else {
    const settingsRepo = new SettingsRepository(db);
    const fetched = await settingsRepo.getMany(["block_cli_download", "rate_limit_download"]);
    settings = fetched as Record<string, string | null>;
    SETTINGS_CACHE.set("dl_settings", { data: settings, expires: Date.now() + 30_000 });
    if (SETTINGS_CACHE.size > 50) {
      const firstKey = SETTINGS_CACHE.keys().next().value;
      if (firstKey) SETTINGS_CACHE.delete(firstKey);
    }
  }

  const blockCli = settings["block_cli_download"] === "true";
  const rateLimitVal = settings["rate_limit_download"] ? Number(settings["rate_limit_download"]) : 0;

  if (blockCli) {
    const uaLower = userAgent.toLowerCase();
    const cliKeywords = ["curl", "wget", "python", "go-http", "httpie", "aria2", "axel", "libwww-perl"];
    if (cliKeywords.some(kw => uaLower.includes(kw))) {
      return c.json({ success: false, message: "CLI download access is disabled." }, 403);
    }
  }

  if (rateLimitVal > 0) {
    const uaLower = userAgent.toLowerCase();
    const cliKeywords = ["curl", "wget", "python", "go-http", "httpie", "aria2", "axel", "libwww-perl", "postman", "insomnia", "http-client", "rust-client", "node-fetch", "axios"];
    const isCli = cliKeywords.some(kw => uaLower.includes(kw)) || (!uaLower.includes("mozilla") && !uaLower.includes("opera") && !uaLower.includes("safari") && !uaLower.includes("firefox") && !uaLower.includes("chrome") && !uaLower.includes("edge"));

    // ONLY apply download rate limit to CLI tools!
    if (isCli) {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const daySeconds = 24 * 60 * 60;
      const windowStart = nowSeconds - daySeconds;

      // Check in-memory cache first
      const cached = rateLimitCache.get(ip);
      let row: DownloadAttemptRow | null = null;

      if (cached && Date.now() < cached.expires) {
        row = { ip, attempts: cached.attempts, last_attempt: cached.lastAttempt } as DownloadAttemptRow;
      } else {
        const dbRow = await db.prepare("SELECT * FROM download_attempts WHERE ip = ?").bind(ip).first<DownloadAttemptRow>();
        row = dbRow;
        if (dbRow) {
          rateLimitCache.set(ip, {
            attempts: dbRow.attempts,
            lastAttempt: dbRow.last_attempt,
            expires: Date.now() + 60_000,
          });
        }
      }

      if (row) {
        if (row.last_attempt <= windowStart) {
          await db.prepare("UPDATE download_attempts SET attempts = 0, last_attempt = ? WHERE ip = ?").bind(nowSeconds, ip).run();
          rateLimitCache.set(ip, { attempts: 0, lastAttempt: nowSeconds, expires: Date.now() + 60_000 });
        } else if (row.attempts >= rateLimitVal) {
          const remainHours = Math.ceil((row.last_attempt + daySeconds - nowSeconds) / 3600);
          return c.json({ success: false, message: `Download limit reached. Try again in ~${remainHours}h.` }, 429);
        }
      }

      const rangeHeader = c.req.header("Range");
      const isNewDownload = !rangeHeader || rangeHeader.trim() === "bytes=0-" || !rangeHeader.trim().startsWith("bytes=");
      if (isNewDownload) {
        if (!row) {
          await db.prepare("INSERT INTO download_attempts (ip, attempts, last_attempt) VALUES (?, 1, ?)").bind(ip, nowSeconds).run();
          rateLimitCache.set(ip, { attempts: 1, lastAttempt: nowSeconds, expires: Date.now() + 60_000 });
        } else if (row.last_attempt > windowStart) {
          await db.prepare("UPDATE download_attempts SET attempts = attempts + 1, last_attempt = ? WHERE ip = ?").bind(nowSeconds, ip).run();
          rateLimitCache.set(ip, { attempts: row.attempts + 1, lastAttempt: nowSeconds, expires: Date.now() + 60_000 });
        }
      }

      // Cleanup cache if too large
      if (rateLimitCache.size > 1000) {
        const firstKey = rateLimitCache.keys().next().value;
        if (firstKey) rateLimitCache.delete(firstKey);
      }
    }
  }

  return null;
}