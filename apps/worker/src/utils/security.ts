import type { Context } from "hono";
import { SettingsRepository } from "../database/settings.repository";
import { extractRealIp } from "./ip-parser";
import type { Env } from "../config/env";

interface DownloadAttemptRow {
  ip: string;
  attempts: number;
  last_attempt: number;
}

export async function enforceDownloadSecurity(c: Context<{ Bindings: Env }>): Promise<Response | null> {
  const db = c.env.DB;
  const ip = extractRealIp(c);
  const userAgent = c.req.header("User-Agent") || "";

  const settingsRepo = new SettingsRepository(db);
  const settings = await settingsRepo.getMany(["block_cli_download", "rate_limit_download"]);

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

      const row = await db.prepare("SELECT * FROM download_attempts WHERE ip = ?").bind(ip).first<DownloadAttemptRow>();

      if (row) {
        if (row.last_attempt <= windowStart) {
          await db.prepare("UPDATE download_attempts SET attempts = 0, last_attempt = ? WHERE ip = ?").bind(nowSeconds, ip).run();
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
        } else if (row.last_attempt > windowStart) {
          await db.prepare("UPDATE download_attempts SET attempts = attempts + 1, last_attempt = ? WHERE ip = ?").bind(nowSeconds, ip).run();
        }
      }
    }
  }

  return null;
}