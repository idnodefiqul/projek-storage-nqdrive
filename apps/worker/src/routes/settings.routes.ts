import { Hono } from "hono";
import { requireAuth } from "../middleware/require-auth.middleware";
import { SettingsRepository } from "../database/settings.repository";
import type { Env } from "../config/env";

/**
 * Settings routes — manage app-level settings (site name, download endpoint, etc.)
 * All routes require authentication.
 */
const settingsRoutes = new Hono<{ Bindings: Env }>();

const ALLOWED_KEYS = [
  "download_endpoint",
  "avatar_style",
  "avatar_seed",
  "brand_color",
  "theme_mode",
  "rate_limit_login",
  "block_cli_download",
  "rate_limit_download",
  "turnstile_enabled",
  "turnstile_sitekey",
  "turnstile_secretkey",
  "share_page_prefix",
  "bandwidth_limit_gb",
  "bandwidth_speed_mbps"
] as const;
type SettingKey = (typeof ALLOWED_KEYS)[number];

/** GET /api/settings — return all settings */
settingsRoutes.get("/", requireAuth, async (c) => {
  const repo = new SettingsRepository(c.env.DB);
  const settings = await repo.getMany([...ALLOWED_KEYS]);
  c.header("Cache-Control", "no-store, no-cache, must-revalidate");
  return c.json({
    success: true,
    data: {
      download_endpoint: settings["download_endpoint"] ?? "default",
      avatar_style: settings["avatar_style"] ?? "pixelArt",
      avatar_seed: settings["avatar_seed"] ?? "",
      brand_color: settings["brand_color"] ?? "",
      theme_mode: settings["theme_mode"] ?? "light",
      rate_limit_login: settings["rate_limit_login"] ?? "0",
      block_cli_download: settings["block_cli_download"] ?? "false",
      rate_limit_download: settings["rate_limit_download"] ?? "0",
      turnstile_enabled: settings["turnstile_enabled"] ?? "false",
      turnstile_sitekey: settings["turnstile_sitekey"] ?? "",
      turnstile_secretkey: settings["turnstile_secretkey"] ?? "",
      share_page_prefix: settings["share_page_prefix"] ?? "p",
      bandwidth_limit_gb: settings["bandwidth_limit_gb"] ?? "0",
      bandwidth_speed_mbps: settings["bandwidth_speed_mbps"] ?? "0",
    },
  });
});

/** PATCH /api/settings — update one or more settings */
settingsRoutes.patch("/", requireAuth, async (c) => {
  const body = await c.req.json<Record<string, string>>();
  const repo = new SettingsRepository(c.env.DB);

  const updates: Record<string, string> = {};

  for (const key of ALLOWED_KEYS) {
    if (key in body) {
      const value = body[key]?.toString() ?? "";

      // Pass through simple keys
      if (
        key === "avatar_style" ||
        key === "avatar_seed" ||
        key === "brand_color" ||
        key === "theme_mode" ||
        key === "rate_limit_login" ||
        key === "block_cli_download" ||
        key === "rate_limit_download" ||
        key === "turnstile_enabled" ||
        key === "turnstile_sitekey" ||
        key === "turnstile_secretkey" ||
        key === "bandwidth_limit_gb" ||
        key === "bandwidth_speed_mbps"
      ) {
        updates[key] = value;
        continue;
      }

      // Validate share_page_prefix
      if (key === "share_page_prefix") {
        const ALLOWED_PREFIXES = ["p", "s", "f"];
        if (!ALLOWED_PREFIXES.includes(value) && !value.startsWith("custom:")) {
          return c.json({
            success: false,
            error: { message: "Prefix share page tidak valid.", code: "INVALID_PREFIX" },
          }, 400);
        }
        if (value.startsWith("custom:")) {
          const prefix = value.slice(7).trim();
          if (!prefix || !/^[a-z0-9_-]+$/i.test(prefix)) {
            return c.json({
              success: false,
              error: { message: "Custom prefix hanya boleh huruf, angka, - dan _.", code: "INVALID_PREFIX" },
            }, 400);
          }
          updates[key] = `custom:${prefix}`;
        } else {
          updates[key] = value;
        }
      }

      // Validate download_endpoint
      if (key === "download_endpoint") {
        const ALLOWED_ENDPOINTS = ["default", "download", "query", "dl", "get"];
        if (!ALLOWED_ENDPOINTS.includes(value) && !value.startsWith("custom:")) {
          return c.json({
            success: false,
            error: { message: "Endpoint download tidak valid.", code: "INVALID_ENDPOINT" },
          }, 400);
        }
        if (value.startsWith("custom:")) {
          const prefix = value.slice(7).trim();
          if (!prefix || !/^[a-z0-9_-]+$/i.test(prefix)) {
            return c.json({
              success: false,
              error: { message: "Custom prefix hanya boleh huruf, angka, - dan _.", code: "INVALID_ENDPOINT" },
            }, 400);
          }
          updates[key] = `custom:${prefix}`;
        } else {
          updates[key] = value;
        }
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ success: false, error: { message: "Tidak ada setting yang valid untuk diupdate.", code: "NO_UPDATES" } }, 400);
  }

  await repo.setMany(updates);

  return c.json({ success: true, data: { updated: Object.keys(updates) } });
});

export { settingsRoutes };