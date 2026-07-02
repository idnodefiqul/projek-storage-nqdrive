/**
 * Pages Function catch-all -- proxy request file/download ke Worker, tanpa
 * mengganggu static asset (JS/CSS Vite) maupun SPA fallback React.
 *
 * FIX FINAL -- pakai env.ASSETS.fetch() sebagai ground-truth, BUKAN menebak
 * dari nama path:
 *   1. Coba ambil asset asli dari Pages dulu via env.ASSETS.fetch(request).
 *   2. Kalau asset DITEMUKAN (status bukan 404) -> kembalikan langsung.
 *   3. Kalau TIDAK ditemukan (404) DAN path terlihat seperti link download
 *      NQDRIVE -> proxy ke Worker.
 *   4. Selain itu -> 404 apa adanya.
 */

interface FunctionEnv {
  WORKER_ORIGIN?: string;
  ASSETS: { fetch: typeof fetch };
}

const DEFAULT_WORKER_ORIGIN = "https://apiweb.fiqul.id";

function looksLikeDownloadPath(pathname: string): boolean {
  if (pathname.startsWith("/download/")) return true;

  if (
    pathname === "/" ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/s/")
  ) {
    return false;
  }

  if (pathname.startsWith("/assets/")) {
    return false;
  }

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length >= 2 && segments[0].length === 23) {
    return true;
  }

  const lastSegment = pathname.slice(pathname.lastIndexOf("/") + 1);
  const dotIndex = lastSegment.lastIndexOf(".");
  return dotIndex > 0 && dotIndex < lastSegment.length - 1;
}

async function proxyToWorker(request: Request, env: FunctionEnv, url: URL): Promise<Response> {
  const workerOrigin = env.WORKER_ORIGIN || DEFAULT_WORKER_ORIGIN;
  const targetUrl = `${workerOrigin}${url.pathname}${url.search}`;

  const proxyHeaders = new Headers(request.headers);
  proxyHeaders.delete("Host");

  const proxiedRequest = new Request(targetUrl, {
    method: request.method,
    headers: proxyHeaders,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "follow",
  });

  const response = await fetch(proxiedRequest);
  return response;
}

export const onRequest: PagesFunction<FunctionEnv> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  // =========================================================================
  // BLOKIR TOTAL: /api/* tidak boleh diakses dari browser kecuali dashboard.
  // =========================================================================
  if (url.pathname.startsWith("/api/")) {
    const dashboardPaths = [
      "/api/auth/", "/api/me", "/api/storage/", "/api/folders/",
      "/api/files/", "/api/logs/", "/api/api-keys/", "/api/dashboard/",
      "/api/trash/", "/api/settings/", "/api/google/",
    ];
    const isDashboardApi = dashboardPaths.some((p) => url.pathname.startsWith(p));
    if (isDashboardApi) {
      return await proxyToWorker(request, env, url);
    }
    return new Response(null, { status: 404 });
  }

  // =========================================================================
  // Download file via direct link (shareCode/dl/slug etc.)
  // =========================================================================
  if (looksLikeDownloadPath(url.pathname)) {
    const workerResponse = await proxyToWorker(request, env, url);
    if (workerResponse.status !== 404) {
      return workerResponse;
    }
  }

  // =========================================================================
  // FALLBACK: Asset statis Pages / SPA fallback (index.html)
  // =========================================================================
  const assetResponse = await env.ASSETS.fetch(request);
  return withCacheHeaders(assetResponse, url.pathname);
};

/** Extensions that should get long-term caching (30 days + revalidate) */
const IMAGE_EXTS = new Set([".png", ".svg", ".ico", ".webp", ".jpg", ".jpeg", ".gif", ".avif"]);
/** Extensions that should get immutable caching (1 year) */
const FONT_EXTS = new Set([".woff2", ".woff", ".ttf", ".otf", ".eot"]);

function getFileExtension(pathname: string): string {
  const lastSlash = pathname.lastIndexOf("/");
  const basename = pathname.slice(lastSlash + 1);
  const dotIndex = basename.lastIndexOf(".");
  if (dotIndex <= 0) return "";
  return basename.slice(dotIndex).toLowerCase();
}

function withCacheHeaders(response: Response, pathname: string): Response {
  if (pathname.startsWith("/assets/")) {
    const r = new Response(response.body, response);
    r.headers.set("Cache-Control", "public, max-age=31536000, immutable");
    return r;
  }

  const contentType = response.headers.get("Content-Type") || "";
  if (contentType.includes("text/html")) {
    const r = new Response(response.body, response);
    r.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    r.headers.set("Pragma", "no-cache");
    return r;
  }

  const ext = getFileExtension(pathname);
  if (IMAGE_EXTS.has(ext)) {
    const r = new Response(response.body, response);
    r.headers.set("Cache-Control", "public, max-age=2592000, stale-while-revalidate=86400");
    return r;
  }

  if (FONT_EXTS.has(ext)) {
    const r = new Response(response.body, response);
    r.headers.set("Cache-Control", "public, max-age=31536000, immutable");
    return r;
  }

  return response;
}
