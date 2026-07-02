import type { ApiResponse } from "@nqdrive/types";

/**
 * Thrown for any non-2xx API response, carrying the structured error info from the
 * worker's consistent ApiErrorResponse envelope so callers (React Query, components)
 * can branch on `error.code` without re-parsing anything.
 */
export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

/**
 * Base URL for the worker API.
 *
 * - In development, Vite proxies /api -> http://localhost:8787 (see vite.config.ts),
 *   so VITE_WORKER_URL is NOT set and the default "" keeps URLs relative.
 * - In production (CF Pages), set VITE_WORKER_URL to the worker URL in the Pages
 *   environment variables dashboard, e.g. https://nqdrive-worker.YOUR_SUBDOMAIN.workers.dev
 *   This is required because Pages and Workers are on different origins in production.
 */
const WORKER_BASE = (import.meta.env.VITE_WORKER_URL as string | undefined) ?? "";

/**
 * Thin fetch wrapper used by every service module in src/services.
 *
 * - `credentials: "include"` is required so the HttpOnly session cookie set by
 *   POST /api/auth/login is sent on every subsequent request — this is the only place
 *   in the codebase that needs to know that auth works via cookies, not a header.
 * - Always parses the worker's consistent { success, data } / { success, error } envelope.
 */
export async function apiRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  } = {}
): Promise<T> {
  const response = await fetch(`${WORKER_BASE}/api${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: {
      "X-App-Client": "nqdrive-web",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  const json = (await response.json()) as ApiResponse<T>;

  if (!json.success) {
    if (response.status === 401) {
      localStorage.setItem("nqdrive_is_logged_in", "false");
    }
    throw new ApiClientError(json.error.message, json.error.code, response.status);
  }

  return json.data;
}
