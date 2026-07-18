import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { requireAuth } from "../middleware/require-auth.middleware";
import { MigrationRepository } from "../database/migration.repository";
import { MigrationService } from "../services/migration.service";
import type { Env } from "../config/env";

/**
 * Route migrasi isi Google Drive antar akun. Di-mount di /api/storage.
 *
 * Alur: POST /accounts/:id/migrate membuat job, lalu loop frontend memanggil
 * POST /migrations/:jobId/process berulang (per batch kecil) sampai selesai.
 * Kalau tab ditutup, cron backstop yang melanjutkan (lihat index.ts scheduled).
 */
const migrationRoutes = new Hono<{ Bindings: Env }>();

migrationRoutes.use("*", requireAuth);

const createMigrationSchema = z.object({
  // Professional: acc_xxx string, dual-mode number
  targetAccountId: z.union([z.string(), z.number().int().positive()]),
});

function toPublicJob(job: any) {
  const taskId = job.taskId ?? job.publicId ?? job.public_id ?? null;
  return {
    taskId,
    sourceAccountId: job.sourceAccountPublicId ?? job.sourceAccountId ?? null,
    targetAccountId: job.targetAccountPublicId ?? job.targetAccountId ?? null,
    sourceEmail: job.sourceEmail,
    targetEmail: job.targetEmail,
    status: job.status,
    totalFiles: job.totalFiles,
    migratedFiles: job.migratedFiles,
    failedFiles: job.failedFiles,
    totalBytes: job.totalBytes,
    migratedBytes: job.migratedBytes,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    finishedAt: job.finishedAt,
  };
}

// ─── POST /api/storage/accounts/:id/migrate ────────────────────────────────
// Dual-mode: source id acc_xxx or numeric, target acc_xxx or numeric
migrationRoutes.post(
  "/accounts/:id/migrate",
  zValidator("json", createMigrationSchema),
  async (c) => {
    const rawSourceId = c.req.param("id");
    const { targetAccountId: rawTargetId } = c.req.valid("json") as any;
    const service = new MigrationService(c.env);

    try {
      // Service now supports publicId or numeric
      const job = await service.createJob(rawSourceId as any, rawTargetId as any);
      return c.json({ success: true, data: { job: toPublicJob(job) } }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal membuat job migrasi.";
      return c.json({ success: false, error: { code: "MIGRATION_FAILED", message } }, 400);
    }
  }
);

// ─── GET /api/storage/migrations/active ────────────────────────────────────
migrationRoutes.get("/migrations/active", async (c) => {
  const repository = new MigrationRepository(c.env.DB);
  const jobs = await repository.findRunning();
  return c.json({ success: true, data: { jobs: jobs.map(toPublicJob) } });
});

// ─── GET /api/storage/migrations/recent ────────────────────────────────────
migrationRoutes.get("/migrations/recent", async (c) => {
  const repository = new MigrationRepository(c.env.DB);
  const jobs = await repository.findRecent(10);
  return c.json({ success: true, data: { jobs: jobs.map(toPublicJob) } });
});

// ─── POST /api/storage/migrations/:jobId/process ───────────────────────────
// Dual-mode: tsk_xxx or numeric
migrationRoutes.post("/migrations/:jobId/process", async (c) => {
  const rawJobId = c.req.param("jobId");
  const service = new MigrationService(c.env);
  try {
    const job = await service.processBatch(rawJobId as any);
    return c.json({ success: true, data: { job: toPublicJob(job) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal memproses batch migrasi.";
    return c.json({ success: false, error: { code: "MIGRATION_FAILED", message } }, 400);
  }
});

// ─── POST /api/storage/migrations/:jobId/cancel ────────────────────────────
// Dual-mode
migrationRoutes.post("/migrations/:jobId/cancel", async (c) => {
  const rawJobId = c.req.param("jobId");
  const service = new MigrationService(c.env);
  try {
    const job = await service.cancelJob(rawJobId as any);
    return c.json({ success: true, data: { job: toPublicJob(job) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal membatalkan migrasi.";
    return c.json({ success: false, error: { code: "MIGRATION_FAILED", message } }, 400);
  }
});

export { migrationRoutes };
