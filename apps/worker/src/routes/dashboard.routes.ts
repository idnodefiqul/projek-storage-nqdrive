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
    driveAccountRepository.findAll() as Promise<any[]>,
    fileRepository.countAll(),
    // Hitung dari download_logs (sudah terdeduplikasi) agar konsisten dengan halaman Logs
    c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM download_logs`
    ).first<{ total: number }>(),
    // Top downloaded: hitung dari download_logs, bukan kolom download_count yang stale
    c.env.DB.prepare(
      `SELECT f.*, f.public_id as file_public_id, 
              da.public_id as drive_account_public_id,
              fld.public_id as folder_public_id,
              COUNT(dl.id) as log_count
        FROM files f
        LEFT JOIN download_logs dl ON dl.file_id = f.id
        LEFT JOIN drive_accounts da ON da.id = f.drive_account_id
        LEFT JOIN folders fld ON fld.id = f.folder_id
        WHERE f.deleted_at IS NULL
        GROUP BY f.id
        ORDER BY log_count DESC
        LIMIT ?`
    ).bind(limitPopular).all<any>(),
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

  // 100% clean professional: only fileId, accountId, folderId
  const topDownloaded = topDownloadedFiles.results.map((row: any) => ({
    fileId: row.file_public_id ?? row.public_id ?? null,
    filename: row.filename,
    slug: row.slug,
    providerFileId: row.provider_file_id,
    accountId: (row as any).drive_account_public_id ?? null,
    folderId: (row as any).folder_public_id ?? null,
    sizeBytes: row.size_bytes,
    mimeType: row.mime_type,
    visibility: row.visibility,
    downloadCount: row.log_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  const distribusiAccounts = finalAccountsForDisplay;

  const accountsStorageDistribusi = distribusiAccounts.map((a: any) => ({
    accountId: a.accountId ?? a.publicId ?? null,
    email: a.email,
    provider: a.provider,
    usedStorageBytes: a.usedStorageBytes,
    totalStorageBytes: a.totalStorageBytes,
    status: a.status,
  }));

  const accountsStorageActive = finalAccountsForDisplay.map((a: any) => ({
    accountId: a.accountId ?? a.publicId ?? null,
    email: a.email,
    provider: a.provider,
    usedStorageBytes: a.usedStorageBytes,
    totalStorageBytes: a.totalStorageBytes,
    status: a.status,
  }));

  const mappedRecentFiles = (recentFiles as any[]).map((f: any) => ({
    fileId: f.fileId ?? f.publicId ?? null,
    accountId: f.accountId ?? null,
    folderId: f.folderPublicId ?? null,
    filename: f.filename,
    slug: f.slug,
    providerFileId: f.providerFileId,
    sizeBytes: f.sizeBytes,
    mimeType: f.mimeType,
    visibility: f.visibility,
    downloadCount: f.downloadCount,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  }));
  const mappedRecentFolders = (recentFolders as any[]).map((fld: any) => ({
    folderId: fld.folderId ?? fld.publicId ?? null,
    name: fld.name,
    parentFolderId: fld.parentFolderPublicId ?? null,
    shareUuid: fld.shareUuid,
    createdAt: fld.createdAt,
    updatedAt: fld.updatedAt,
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
      recentFiles: mappedRecentFiles,
      recentFolders: mappedRecentFolders,
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
