/**
 * Cloudflare Worker environment bindings.
 * Kept in sync with the bindings declared in wrangler.jsonc and the secrets
 * configured via `wrangler secret put`.
 */
export interface Env {
  // Bindings
  DB: D1Database;

  // Vars (wrangler.jsonc "vars")
  APP_ENV: "development" | "production";
  GOOGLE_OAUTH_REDIRECT_URI: string;
  WEB_APP_URL: string;

  // Secrets (set via `wrangler secret put` / .dev.vars)
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  ENCRYPTION_KEY: string;
  TELEGRAM_API_BASE?: string;
}
