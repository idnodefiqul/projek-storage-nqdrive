import { Hono } from "hono";
import { requireAuth } from "../middleware/require-auth.middleware";
import { FileRepository } from "../database/file.repository";
import { FolderRepository } from "../database/folder.repository";
import { DriveAccountRepository } from "../database/drive-account.repository";
import { calculatePercentage } from "@nqdrive/shared";
import type { Env } from "../config/env";

// Simple in-memory cache for dashboard metrics (edge-local, per isolate)
// Avoids hitting D1 on every request when many users load dashboard simultaneously
type CacheEntry = { data: any; expires: number };
const metricsCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15_000; // 15s for metrics, 60s for analytics

function getCached(key: string): any | null {
  const entry = metricsCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    metricsCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key: string, data: any, ttlMs: number) {
  metricsCache.set(key, { data, expires: Date.now() + ttlMs });
  // Prevent unbounded growth
  if (metricsCache.size > 100) {
    const firstKey = metricsCache.keys().next().value;
    if (firstKey) metricsCache.delete(firstKey);
  }
}

const dashboardRoutes = new Hono<{ Bindings: Env }>();

dashboardRoutes.use("*", requireAuth);

dashboardRoutes.get("/metrics", async (c) => {
  // Try cache first (per user? For now global cache key, since metrics are same for all admins in single-tenant)
  const cacheKey = "metrics:v2";
  const cached = getCached(cacheKey);
  if (cached) {
    c.header("X-Cache", "HIT");
    c.header("Cache-Control", "private, max-age=10");
    return c.json(cached);
  }

  const driveAccountRepository = new DriveAccountRepository(c.env.DB);
  const fileRepository = new FileRepository(c.env.DB);
  const folderRepository = new FolderRepository(c.env.DB);

  const limitRecent = 7;
  const limitPopular = 15; // user minta bar kecil-kecil naik urut, support sampai 15 top populer

  const [
    accounts,
    fileCount,
    downloadCountRow,
    topDownloadedFiles,
    recentFiles,
    recentFolders,
    topCountriesRows,
  ] = await Promise.all([
    driveAccountRepository.findAll(),
    fileRepository.countAll(),
    // Hitung dari download_logs (sudah terdeduplikasi) agar konsisten dengan halaman Logs
    c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM download_logs`
    ).first<{ total: number }>(),
    // Top downloaded: hitung dari download_logs, bukan kolom download_count yang stale
    // FIX: filter deleted_at IS NULL agar file di Trash tidak ikut → sinkron distribusi
    c.env.DB.prepare(
      `SELECT f.*, COUNT(dl.id) as log_count
        FROM files f
        LEFT JOIN download_logs dl ON dl.file_id = f.id
        WHERE f.deleted_at IS NULL
        GROUP BY f.id
        ORDER BY log_count DESC
        LIMIT ?`
    ).bind(limitPopular).all<{ id: number; filename: string; slug: string; provider_file_id: string; drive_account_id: number; folder_id: number | null; size_bytes: number; mime_type: string; visibility: string; download_count: number; created_at: string; updated_at: string; log_count: number }>(),
    fileRepository.getRecent(limitRecent),
    folderRepository.getRecent(limitRecent),
    c.env.DB.prepare(
      `SELECT country, COUNT(*) as count FROM download_logs WHERE country IS NOT NULL AND country != '' GROUP BY country ORDER BY count DESC LIMIT 10`
    ).all<{ country: string; count: number }>(),
  ]);

  // FIX: exclude telegram dari distribusi & summary karena sudah dihapus user tapi masih ada di DB (legacy)
  // + exclude akun dengan refresh_token kosong (sudah disconnect) dari total hitungan
  // biar Akun Online tidak jadi 8/9 padahal dashboard cuma 8 terhubung
  const activeAccounts = accounts.filter((a) => (a.provider as string) !== "telegram" && (a.refreshTokenEncrypted ?? "") !== "");
  const onlineAccountsList = activeAccounts.filter((a) => a.status === "online");
  // Untuk distribusi & volume, tampilkan hanya yang online aktif biar dashboard 8 sesuai
  const finalAccountsForDisplay = onlineAccountsList;

  const downloadCount = downloadCountRow?.total ?? 0;

  // Map top downloaded files — pakai log_count sebagai download_count agar konsisten
  const topDownloaded = topDownloadedFiles.results.map((row) => ({
    id: row.id,
    filename: row.filename,
    slug: row.slug,
    providerFileId: row.provider_file_id,
    driveAccountId: row.drive_account_id,
    folderId: row.folder_id,
    sizeBytes: row.size_bytes,
    mimeType: row.mime_type,
    visibility: row.visibility,
    downloadCount: row.log_count,  // gunakan hitungan dari logs, bukan kolom stale
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  // Distribusi & Volume sekarang hanya yang online aktif (bukan telegram, token ada, status online)
  const distribusiAccounts = finalAccountsForDisplay;

  const accountsStorageDistribusi = distribusiAccounts.map((a) => ({
    id: a.id,
    email: a.email,
    provider: a.provider,
    usedStorageBytes: a.usedStorageBytes,
    totalStorageBytes: a.totalStorageBytes,
    status: a.status,
  }));

  const accountsStorageActive = finalAccountsForDisplay.map((a) => ({
    id: a.id,
    email: a.email,
    provider: a.provider,
    usedStorageBytes: a.usedStorageBytes,
    totalStorageBytes: a.totalStorageBytes,
    status: a.status,
  }));

  const responseData = {
    success: true,
    data: {
      summary: {
        totalStorageBytes: finalAccountsForDisplay.reduce((s,a)=>s+a.totalStorageBytes,0),
        usedStorageBytes: finalAccountsForDisplay.reduce((s,a)=>s+a.usedStorageBytes,0),
        availableStorageBytes: finalAccountsForDisplay.reduce((s,a)=>s+a.availableStorageBytes,0),
        usedPercentage: calculatePercentage(
          finalAccountsForDisplay.reduce((s,a)=>s+a.usedStorageBytes,0),
          finalAccountsForDisplay.reduce((s,a)=>s+a.totalStorageBytes,0)
        ),
        totalAccounts: finalAccountsForDisplay.length,
        onlineAccounts: finalAccountsForDisplay.length,
        offlineAccounts: 0,
        totalFiles: fileCount,
        totalDownloads: downloadCount,
      },
      accountsStorage: accountsStorageActive,
      accountsStorageDistribusi,
      topCountries: (topCountriesRows?.results ?? []).map(r => ({ country: r.country, count: r.count })),
      topDownloadedFiles: topDownloaded,
      recentFiles,
      recentFolders,
    },
  };

  setCached(cacheKey, responseData, CACHE_TTL_MS);
  c.header("X-Cache", "MISS");
  c.header("Cache-Control", "private, max-age=10, stale-while-revalidate=30");
  return c.json(responseData);
});

/** GET /api/dashboard/analytics — download & upload counts per day for last 30 days */
dashboardRoutes.get("/analytics", async (c) => {
  const days = Math.min(90, Number(c.req.query("days") ?? 30));
  const cacheKey = `analytics:${days}`;
  const cached = getCached(cacheKey);
  if (cached) {
    c.header("X-Cache", "HIT");
    c.header("Cache-Control", "private, max-age=60");
    return c.json(cached);
  }

  const [downloadRows, uploadRows] = await Promise.all([
    c.env.DB.prepare(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM download_logs
       WHERE created_at >= DATE('now', '-' || ? || ' days')
       GROUP BY DATE(created_at)
       ORDER BY date ASC`
    )
      .bind(days)
      .all<{ date: string; count: number }>(),

    c.env.DB.prepare(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM upload_logs
       WHERE status = 'success' AND created_at >= DATE('now', '-' || ? || ' days')
       GROUP BY DATE(created_at)
       ORDER BY date ASC`
    )
      .bind(days)
      .all<{ date: string; count: number }>(),
  ]);

  // Build a map of date -> counts, merging download & upload
  const dateMap: Record<string, { downloads: number; uploads: number }> = {};

  // Fill all dates in range with 0
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0]!;
    dateMap[dateStr] = { downloads: 0, uploads: 0 };
  }

  for (const row of downloadRows.results) {
    const entry = dateMap[row.date];
    if (entry) {
      entry.downloads = row.count;
    }
  }
  for (const row of uploadRows.results) {
    const entry = dateMap[row.date];
    if (entry) {
      entry.uploads = row.count;
    }
  }

  const chartData = Object.entries(dateMap).map(([date, counts]) => ({
    date,
    downloads: counts.downloads,
    uploads: counts.uploads,
  }));

  const responseData = { success: true, data: { chartData } };
  setCached(cacheKey, responseData, 60_000);
  c.header("X-Cache", "MISS");
  c.header("Cache-Control", "private, max-age=60, stale-while-revalidate=120");
  return c.json(responseData);
});

export { dashboardRoutes };
