/**
 * Pages Function catch-all — proxy request file/download ke Worker, tanpa
 * mengganggu static asset (JS/CSS Vite) maupun SPA fallback React.
 *
 * MASALAH #1 (sudah diperbaiki sebelumnya):
 * public/_redirects tidak bisa proxy ke domain eksternal (apiweb.fiqul.id),
 * jadi rule lama diam-diam diabaikan Cloudflare -> akses file selalu jatuh
 * ke fallback SPA index.html alih-alih download.
 *
 * MASALAH #2 (bug dari fix pertama, diperbaiki di versi ini):
 * Deteksi "file download" awalnya cuma "ada titik di nama path terakhir"
 * -> ikut menangkap asset Vite (/assets/index-D8x9aQ.js, dst) yang juga
 * punya titik, lalu salah proxy ke Worker -> Worker balas 404 (bukan slug
 * valid) -> browser gagal load JS -> halaman jadi blank putih total.
 *
 * FIX FINAL — pakai env.ASSETS.fetch() sebagai ground-truth, BUKAN menebak
 * dari nama path:
 *   1. Coba ambil asset asli dari Pages dulu via env.ASSETS.fetch(request).
 *      Ini API resmi Cloudflare untuk fetch static asset (JS, CSS, gambar,
 *      favicon, DAN index.html untuk SPA fallback -- semuanya sudah
 *      ditangani otomatis oleh asset server Pages, termasuk SPA fallback
 *      bawaan karena project ini tidak punya 404.html).
 *   2. Kalau asset DITEMUKAN (status bukan 404) -> kembalikan langsung.
 *      Ini mencakup semua bundle React/Vite dan route dashboard (yang
 *      di-fallback ke index.html oleh Pages secara otomatis).
 *   3. Kalau TIDAK ditemukan (404) DAN path terlihat seperti link download
 *      NQDRIVE ("/download/:slug" atau "/:slug.ext") -> proxy ke Worker.
 *   4. Selain itu -> 404 apa adanya (jangan asal proxy path random ke Worker).
 *
 * Worker base URL di-hardcode (bukan env var) karena Pages Functions hanya
 * membaca env yang dikonfigurasi di dashboard CF Pages -> kalau nanti mau
 * ganti, ubah konstanta di bawah atau set via Pages env var WORKER_ORIGIN
 * dan baca dari context.env.
 */

interface FunctionEnv {
  WORKER_ORIGIN?: string;
  ASSETS: { fetch: typeof fetch };
}

const DEFAULT_WORKER_ORIGIN = "https://apiweb.fiqul.id";

// Dipakai HANYA sebagai filter untuk menghindari request yang jelas-jelas
// bukan download agar tidak membebani Worker.
function looksLikeDownloadPath(pathname: string): boolean {
  if (pathname.startsWith("/download/")) return true;

  // Jangan pernah proxy routing internal web (SPA fallback)
  if (pathname === "/" || pathname.startsWith("/dashboard") || pathname.startsWith("/login") || pathname.startsWith("/api/")) {
    return false;
  }

  // Jangan pernah proxy asset statis bawaan Vite (js, css, dll)
  if (pathname.startsWith("/assets/")) {
    return false;
  }

  const lastSegment = pathname.slice(pathname.lastIndexOf("/") + 1);
  const dotIndex = lastSegment.lastIndexOf(".");
  return dotIndex > 0 && dotIndex < lastSegment.length - 1;
}

async function proxyToWorker(request: Request, env: FunctionEnv, url: URL): Promise<Response> {
  const workerOrigin = env.WORKER_ORIGIN || DEFAULT_WORKER_ORIGIN;
  const targetUrl = `${workerOrigin}${url.pathname}${url.search}`;

  // Copy headers tapi hapus "Host" agar routing Cloudflare tidak salah alamat
  // (Jika Host tetap drive.fiqul.id, CF akan mencari route di project Pages, bukan Worker)
  const proxyHeaders = new Headers(request.headers);
  proxyHeaders.delete("Host");

  // Teruskan request asli apa adanya (method, headers termasuk Range, body)
  // supaya resumable download / Range request tetap berfungsi end-to-end.
  const proxiedRequest = new Request(targetUrl, {
    method: request.method,
    headers: proxyHeaders,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "follow",
  });

  const response = await fetch(proxiedRequest);

  // Kembalikan response Worker apa adanya SECARA LANGSUNG.
  // JANGAN dibungkus dengan `new Response(response.body, ...)` karena runtime
  // Cloudflare Pages akan membuang header `Content-Length` dan mengubah stream 
  // menjadi Transfer-Encoding: chunked, yang akan merusak fitur resume download.
  return response;
}

export const onRequest: PagesFunction<FunctionEnv> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  // Langkah 1: Jika path terlihat seperti download file (memiliki ekstensi),
  // Coba proxy ke Worker TERLEBIH DAHULU.
  // Alasan: ASSETS.fetch() tidak akan pernah mengembalikan 404 karena adanya
  // aturan SPA fallback (/* /index.html 200) di file _redirects.
  if (looksLikeDownloadPath(url.pathname)) {
    const workerResponse = await proxyToWorker(request, env, url);
    
    // Jika worker mengembalikan selain 404 (misal 200 OK, 206 Partial, 500 Error),
    // kembalikan response tersebut ke user.
    if (workerResponse.status !== 404) {
      return workerResponse;
    }
    // Jika 404, mungkin itu adalah asset statis sungguhan di root folder (misal file .apbx)
    // yang tidak ada di database Worker. Kita lanjut ke fallback ASSETS.fetch().
  }

  // Langkah 2: Jika bukan jalur download ATAU Worker merespon 404,
  // layani dengan asset statis Pages / SPA fallback (index.html).
  return await env.ASSETS.fetch(request);
};
