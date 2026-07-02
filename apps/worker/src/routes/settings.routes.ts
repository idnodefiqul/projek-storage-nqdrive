import { Hono } from "hono";
import { requireAuth } from "../middleware/require-auth.middleware";
import { SettingsRepository } from "../database/settings.repository";
import type { Env } from "../config/env";

/**
 * Settings routes — manage app-level settings (site name, download endpoint, etc.)
 * All routes require authentication.
 */
const settingsRoutes = new Hono<{ Bindings: Env }>();

const ALLOWED_KEYS = ["download_endpoint"] as const;
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

      // Validate download_endpoint
      if (key === "download_endpoint") {
        const ALLOWED_ENDPOINTS = ["default", "download", "query", "dl", "get"];
        // Allow "custom:xxx" format
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

/**
 * GET /api/settings/public — unauthenticated endpoint for the landing page and login page
 * to fetch the site name without needing to be logged in.
 */
export const settingsPublicRoutes = new Hono<{ Bindings: Env }>();

settingsPublicRoutes.get("/", async (c) => {
  // Anti-direct browsing protection
  const clientHeader = c.req.header("X-App-Client");
  if (clientHeader !== "nqdrive-web") {
    return c.text("Forbidden: Direct browser access to this API endpoint is disabled.", 403);
  }

  // Must NOT be cached by Cloudflare edge or browser
  c.header("Cache-Control", "no-store, no-cache, must-revalidate");
  return c.json({
    success: true,
    data: {
      site_name: "NQDRIVE",
      site_logo: "",
    },
  });
});

export { settingsRoutes };
