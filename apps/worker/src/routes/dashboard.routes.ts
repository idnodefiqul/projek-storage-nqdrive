import { Hono } from "hono";
import { requireAuth } from "../middleware/require-auth.middleware";
import { FileRepository } from "../database/file.repository";
import { FolderRepository } from "../database/folder.repository";
import { DriveAccountRepository } from "../database/drive-account.repository";
import { calculatePercentage } from "@nqdrive/shared";
import type { Env } from "../config/env";

const dashboardRoutes = new Hono<{ Bindings: Env }>();

dashboardRoutes.use("*", requireAuth);

dashboardRoutes.get("/metrics", async (c) => {
  const driveAccountRepository = new DriveAccountRepository(c.env.DB);
  const fileRepository = new FileRepository(c.env.DB);
  const folderRepository = new FolderRepository(c.env.DB);

  const limit = 5;

  const [
    accounts,
    fileCount,
    downloadCountRow,
    topDownloadedFiles,
    recentFiles,
    recentFolders,
  ] = await Promise.all([
    driveAccountRepository.findAll(),
    fileRepository.countAll(),
    // Hitung dari download_logs (sudah terdeduplikasi) agar konsisten dengan halaman Logs
    c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM download_logs`
    ).first<{ total: number }>(),
    // Top downloaded: hitung dari download_logs, bukan kolom download_count yang stale
    c.env.DB.prepare(
      `SELECT f.*, COUNT(dl.id) as log_count
       FROM files f
       LEFT JOIN download_logs dl ON dl.file_id = f.id
       GROUP BY f.id
       ORDER BY log_count DESC
       LIMIT ?`
    ).bind(limit).all<{ id: number; filename: string; slug: string; provider_file_id: string; drive_account_id: number; folder_id: number | null; size_bytes: number; mime_type: string; visibility: string; download_count: number; created_at: string; updated_at: string; log_count: number }>(),
    fileRepository.getRecent(limit),
    folderRepository.getRecent(limit),
  ]);

  const totalStorageBytes = accounts.reduce((sum, a) => sum + a.totalStorageBytes, 0);
  const usedStorageBytes = accounts.reduce((sum, a) => sum + a.usedStorageBytes, 0);
  const availableStorageBytes = accounts.reduce((sum, a) => sum + a.availableStorageBytes, 0);

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

  return c.json({
    success: true,
    data: {
      summary: {
        totalStorageBytes,
        usedStorageBytes,
        availableStorageBytes,
        usedPercentage: calculatePercentage(usedStorageBytes, totalStorageBytes),
        totalAccounts: accounts.length,
        onlineAccounts: accounts.filter((a) => a.status === "online").length,
        offlineAccounts: accounts.filter((a) => a.status === "offline").length,
        totalFiles: fileCount,
        totalDownloads: downloadCount,
      },
      topDownloadedFiles: topDownloaded,
      recentFiles,
      recentFolders,
    },
  });
});

/** GET /api/dashboard/analytics — download & upload counts per day for last 30 days */
dashboardRoutes.get("/analytics", async (c) => {
  const days = Math.min(90, Number(c.req.query("days") ?? 30));

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
    if (dateMap[row.date]) {
      dateMap[row.date].downloads = row.count;
    }
  }
  for (const row of uploadRows.results) {
    if (dateMap[row.date]) {
      dateMap[row.date].uploads = row.count;
    }
  }

  const chartData = Object.entries(dateMap).map(([date, counts]) => ({
    date,
    downloads: counts.downloads,
    uploads: counts.uploads,
  }));

  return c.json({ success: true, data: { chartData } });
});

export { dashboardRoutes };
