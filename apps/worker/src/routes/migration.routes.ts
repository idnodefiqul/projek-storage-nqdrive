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
  targetAccountId: z.number().int().positive(),
});

// ─── POST /api/storage/accounts/:id/migrate ────────────────────────────────
migrationRoutes.post(
  "/accounts/:id/migrate",
  zValidator("json", createMigrationSchema),
  async (c) => {
    const sourceAccountId = Number(c.req.param("id"));
    if (isNaN(sourceAccountId)) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Akun tidak ditemukan." } },
        404
      );
    }

    const { targetAccountId } = c.req.valid("json");
    const service = new MigrationService(c.env);

    try {
      const job = await service.createJob(sourceAccountId, targetAccountId);
      return c.json({ success: true, data: { job } }, 201);
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
  return c.json({ success: true, data: { jobs } });
});

// ─── GET /api/storage/migrations/recent ────────────────────────────────────
migrationRoutes.get("/migrations/recent", async (c) => {
  const repository = new MigrationRepository(c.env.DB);
  const jobs = await repository.findRecent(10);
  return c.json({ success: true, data: { jobs } });
});

// ─── POST /api/storage/migrations/:jobId/process ───────────────────────────
migrationRoutes.post("/migrations/:jobId/process", async (c) => {
  const jobId = Number(c.req.param("jobId"));
  if (isNaN(jobId)) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: "Job tidak ditemukan." } },
      404
    );
  }

  const service = new MigrationService(c.env);
  try {
    const job = await service.processBatch(jobId);
    return c.json({ success: true, data: { job } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal memproses batch migrasi.";
    return c.json({ success: false, error: { code: "MIGRATION_FAILED", message } }, 400);
  }
});

// ─── POST /api/storage/migrations/:jobId/cancel ────────────────────────────
migrationRoutes.post("/migrations/:jobId/cancel", async (c) => {
  const jobId = Number(c.req.param("jobId"));
  if (isNaN(jobId)) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: "Job tidak ditemukan." } },
      404
    );
  }

  const service = new MigrationService(c.env);
  try {
    const job = await service.cancelJob(jobId);
    return c.json({ success: true, data: { job } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal membatalkan migrasi.";
    return c.json({ success: false, error: { code: "MIGRATION_FAILED", message } }, 400);
  }
});

export { migrationRoutes };
