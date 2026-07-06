import { MigrationRepository } from "../database/migration.repository";
import { MigrationService } from "../services/migration.service";
import type { Env } from "../config/env";

// Batas kerja per invocation cron: 8 batch × 5 file = maks 40 file per job per
// run (±6 subrequest per file → aman di bawah limit subrequest Workers).
const MAX_BATCHES_PER_JOB = 8;

/**
 * Cron backstop migrasi: melanjutkan job migrasi yang masih 'running' saat
 * tidak ada tab dashboard yang terbuka (loop frontend mati). Berjalan tiap
 * 10 menit bersama sync akun — lambat tapi pasti sampai selesai.
 */
export async function processRunningMigrations(env: Env): Promise<void> {
  const repository = new MigrationRepository(env.DB);
  const jobs = await repository.findRunning();
  if (jobs.length === 0) return;

  const service = new MigrationService(env);

  for (const job of jobs) {
    try {
      for (let batch = 0; batch < MAX_BATCHES_PER_JOB; batch++) {
        const updated = await service.processBatch(job.id);
        if (updated.status !== "running") break;
      }
    } catch (error) {
      console.error(`Cron migrasi: job ${job.id} error:`, error);
    }
  }
}
